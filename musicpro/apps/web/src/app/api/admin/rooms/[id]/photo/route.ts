import { NextResponse } from "next/server";

import {
  WEBSITE_STORAGE_BUCKET,
  getAdminRoomById,
  updateRoomPhotoUrl,
} from "@musicpro/database";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageRooms } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

const SNIFF_TO_TYPE: Record<string, { ext: string; contentType: string }> = {
  jpg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  webp: { ext: "webp", contentType: "image/webp" },
  gif: { ext: "gif", contentType: "image/gif" },
};

type RouteContext = { params: Promise<{ id: string }> };

function sniffImageKind(bytes: Buffer): keyof typeof SNIFF_TO_TYPE | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function publicHttpsUrl(url: string): string | null {
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) {
    const upgraded = `https://${url.slice("http://".length)}`;
    return upgraded.startsWith("https://") ? upgraded : null;
  }
  return null;
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${WEBSITE_STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "");
}

async function requireRoomPhotoAccess(roomId: string): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; room: NonNullable<Awaited<ReturnType<typeof getAdminRoomById>>> }
  | { ok: false; response: NextResponse }
> {
  const member = await getAdminMember();
  if (!member || !canManageRooms(member.roles)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Non autorizzato." },
        { status: 403 },
      ),
    };
  }

  const supabase = await createClient();
  const room = await getAdminRoomById(supabase, roomId);
  if (!room) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Sala non trovata." },
        { status: 404 },
      ),
    };
  }

  return { ok: true, supabase, room };
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante." },
      { status: 400 },
    );
  }

  const access = await requireRoomPhotoAccess(id);
  if (!access.ok) return access.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "Multipart non valido." },
      { status: 400 },
    );
  }

  const uploaded = formData.get("file") ?? formData.get("photo");
  if (!(uploaded instanceof File)) {
    return NextResponse.json(
      { success: false, message: "Campo file mancante." },
      { status: 400 },
    );
  }
  if (uploaded.size <= 0) {
    return NextResponse.json(
      { success: false, message: "File vuoto." },
      { status: 400 },
    );
  }
  if (uploaded.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, message: "File troppo grande (max 4 MB)." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await uploaded.arrayBuffer());
  const kind = sniffImageKind(bytes);
  if (!kind) {
    return NextResponse.json(
      {
        success: false,
        message: "Formato non supportato (jpeg, png, webp, gif).",
      },
      { status: 400 },
    );
  }
  const { ext, contentType } = SNIFF_TO_TYPE[kind];
  const path = `rooms/${id}/cover.${ext}`;

  const storage = createServiceRoleClient();
  const previousPath = access.room.photo_url
    ? storagePathFromPublicUrl(access.room.photo_url)
    : null;

  const { error: uploadError } = await storage.storage
    .from(WEBSITE_STORAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      {
        success: false,
        message: uploadError.message || "Caricamento non riuscito.",
      },
      { status: 500 },
    );
  }

  const { data } = storage.storage
    .from(WEBSITE_STORAGE_BUCKET)
    .getPublicUrl(path);
  const url = publicHttpsUrl(data.publicUrl);
  if (!url) {
    return NextResponse.json(
      { success: false, message: "URL pubblico non valido." },
      { status: 500 },
    );
  }

  // Cache-bust: stesso path cover.* dopo upsert.
  const photoUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;

  const result = await updateRoomPhotoUrl(access.supabase, id, photoUrl);
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage || "Impossibile salvare la foto.",
      },
      { status: 500 },
    );
  }

  if (previousPath && previousPath !== path) {
    await storage.storage.from(WEBSITE_STORAGE_BUCKET).remove([previousPath]);
  }

  return NextResponse.json({ success: true, photoUrl });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante." },
      { status: 400 },
    );
  }

  const access = await requireRoomPhotoAccess(id);
  if (!access.ok) return access.response;

  const previousUrl = access.room.photo_url?.trim() || null;
  const previousPath = previousUrl
    ? storagePathFromPublicUrl(previousUrl)
    : null;

  const result = await updateRoomPhotoUrl(access.supabase, id, null);
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage || "Impossibile rimuovere la foto.",
      },
      { status: 500 },
    );
  }

  if (previousPath) {
    const storage = createServiceRoleClient();
    await storage.storage.from(WEBSITE_STORAGE_BUCKET).remove([previousPath]);
  }

  return NextResponse.json({ success: true, photoUrl: null });
}
