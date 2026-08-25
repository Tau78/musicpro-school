import { NextResponse } from "next/server";

import { WEBSITE_STORAGE_BUCKET } from "@musicpro/database";

import { requireWebsiteAdmin } from "@/lib/admin/website-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

const SNIFF_TO_TYPE: Record<string, { ext: string; contentType: string }> = {
  jpg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  webp: { ext: "webp", contentType: "image/webp" },
  gif: { ext: "gif", contentType: "image/gif" },
};

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
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
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

export async function POST(request: Request) {
  const access = await requireWebsiteAdmin();
  if (access.error) return access.error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Multipart non valido." }, { status: 400 });
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return NextResponse.json({ ok: false, message: "Campo file mancante." }, { status: 400 });
  }

  if (uploaded.size <= 0) {
    return NextResponse.json({ ok: false, message: "File vuoto." }, { status: 400 });
  }
  if (uploaded.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, message: "File troppo grande (max 4 MB)." }, { status: 400 });
  }

  const bytes = Buffer.from(await uploaded.arrayBuffer());
  const kind = sniffImageKind(bytes);
  if (!kind) {
    return NextResponse.json(
      { ok: false, message: "Formato non supportato (jpeg, png, webp, gif)." },
      { status: 400 },
    );
  }
  const { ext, contentType } = SNIFF_TO_TYPE[kind];

  const year = new Date().getFullYear();
  const path = `${year}/${crypto.randomUUID()}.${ext}`;

  const storage = createServiceRoleClient();
  const { error } = await storage.storage.from(WEBSITE_STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "Caricamento non riuscito." },
      { status: 500 },
    );
  }

  const { data } = storage.storage.from(WEBSITE_STORAGE_BUCKET).getPublicUrl(path);
  const url = publicHttpsUrl(data.publicUrl);
  if (!url) {
    return NextResponse.json(
      { ok: false, message: "URL pubblico non valido." },
      { status: 500 },
    );
  }

  const altRaw = formData.get("alt");
  const alt = typeof altRaw === "string" && altRaw.trim() ? altRaw.trim() : undefined;

  return NextResponse.json({ ok: true, url, ...(alt ? { alt } : {}) });
}
