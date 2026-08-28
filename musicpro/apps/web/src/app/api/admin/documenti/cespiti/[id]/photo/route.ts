import { NextResponse } from "next/server";

import {
  getFixedAssetById,
  updateFixedAssetPhotoPath,
} from "@musicpro/database";

import {
  CESPITI_STORAGE_BUCKET,
  requireCespitiAccess,
  signedPhotoUrl,
} from "@/lib/admin/cespiti-auth";

const STORAGE_BUCKET = CESPITI_STORAGE_BUCKET;
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "photo.jpg";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned || "photo.jpg";
}

function inferContentType(filename: string, declaredType: string): string | null {
  const normalized = declaredType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized && ALLOWED_TYPES.has(normalized)) return normalized;

  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    default:
      return null;
  }
}

function isDeadlockError(message: string): boolean {
  return message.includes("40P01") || /deadlock/i.test(message);
}

async function withDeadlockRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isDeadlockError(message) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const asset = await getFixedAssetById(access.serviceSupabase, id);
  if (!asset) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "Multipart non valido" },
      { status: 400 },
    );
  }

  const uploaded = formData.get("file") ?? formData.get("photo");
  if (!(uploaded instanceof File)) {
    return NextResponse.json(
      { success: false, message: "Campo file mancante" },
      { status: 400 },
    );
  }

  if (uploaded.size <= 0 || uploaded.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, message: "File troppo grande (max 8 MB)" },
      { status: 400 },
    );
  }

  const filename = sanitizeFilename(uploaded.name || "photo.jpg");
  const contentType =
    inferContentType(filename, uploaded.type || "") ?? "image/jpeg";

  const storagePath = `assets/${id}/${Date.now()}-${filename}`;

  if (asset.photoStoragePath) {
    await access.serviceSupabase.storage
      .from(STORAGE_BUCKET)
      .remove([asset.photoStoragePath]);
  }

  const bytes = Buffer.from(await uploaded.arrayBuffer());
  const { error: uploadError } = await access.serviceSupabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    const hint = uploadError.message?.includes("Bucket not found")
      ? " Bucket Storage non configurato."
      : "";
    return NextResponse.json(
      {
        success: false,
        message: `${uploadError.message || "Impossibile caricare la foto."}${hint}`,
      },
      { status: 400 },
    );
  }

  let updated;
  try {
    updated = await withDeadlockRetry(() =>
      updateFixedAssetPhotoPath(
        access.serviceSupabase,
        id,
        storagePath,
        access.member.id,
      ),
    );
  } catch (error) {
    await access.serviceSupabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    const message =
      error instanceof Error ? error.message : "Impossibile aggiornare il cespite.";
    return NextResponse.json(
      {
        success: false,
        message: isDeadlockError(message)
          ? "Conflitto temporaneo sul database. Riprova tra un istante."
          : message,
      },
      { status: 500 },
    );
  }

  if (!updated.success) {
    await access.serviceSupabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json(
      {
        success: false,
        message: updated.errorMessage ?? "Impossibile aggiornare il cespite.",
      },
      { status: 400 },
    );
  }

  const photoUrl = await signedPhotoUrl(access.supabase, storagePath);

  return NextResponse.json({
    success: true,
    id,
    photoStoragePath: storagePath,
    photoUrl,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const asset = await getFixedAssetById(access.serviceSupabase, id);
  if (!asset) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  if (asset.photoStoragePath) {
    await access.serviceSupabase.storage
      .from(STORAGE_BUCKET)
      .remove([asset.photoStoragePath]);
  }

  const updated = await updateFixedAssetPhotoPath(
    access.serviceSupabase,
    id,
    null,
    access.member.id,
  );

  if (!updated.success) {
    return NextResponse.json(
      {
        success: false,
        message: updated.errorMessage ?? "Impossibile aggiornare il cespite.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id });
}
