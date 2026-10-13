import { NextResponse } from "next/server";

import { updateMarketListing } from "@musicpro/database";

import {
  marketErrorResponse,
  rejectPersonalMarketEdit,
  requireMarketAccess,
} from "@/lib/admin/market-auth";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type RouteContext = { params: Promise<{ id: string }> };

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireMarketAccess();
  if (access.error || !access.member) return access.error;
  const { id } = await context.params;
  const blocked = await rejectPersonalMarketEdit(
    access.supabase,
    access.member.roles,
    id,
  );
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "File mancante." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, message: "File mancante." },
      { status: 400 },
    );
  }
  const type = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!ALLOWED.has(type)) {
    return NextResponse.json(
      { success: false, message: "Usa una foto JPG, PNG o WebP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, message: "Foto troppo grande (max 4 MB)." },
      { status: 400 },
    );
  }

  const path = `market/${id}.${extensionFor(type)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await access.supabase.storage.from("website").upload(path, bytes, {
    contentType: type,
    upsert: true,
  });
  if (uploaded.error) {
    return NextResponse.json(
      { success: false, message: "Impossibile caricare la foto." },
      { status: 400 },
    );
  }

  try {
    await updateMarketListing(access.supabase, id, { photoPath: path });
    return NextResponse.json({ success: true, photoPath: path });
  } catch (error) {
    return marketErrorResponse(error);
  }
}
