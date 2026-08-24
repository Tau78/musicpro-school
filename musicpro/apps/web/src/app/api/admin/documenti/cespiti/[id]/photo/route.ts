import { NextResponse } from "next/server";

import {
  getFixedAssetById,
  updateFixedAsset,
} from "@musicpro/database";

import {
  CESPITI_STORAGE_BUCKET,
  requireCespitiAccess,
  signedPhotoUrl,
} from "@/lib/admin/cespiti-auth";

const STORAGE_BUCKET = CESPITI_STORAGE_BUCKET;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "photo.jpg";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned || "photo.jpg";
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

  const asset = await getFixedAssetById(access.supabase, id);
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
      { success: false, message: "File troppo grande (max 5 MB)" },
      { status: 400 },
    );
  }

  const contentType = uploaded.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { success: false, message: "Formato immagine non supportato" },
      { status: 400 },
    );
  }

  const filename = sanitizeFilename(uploaded.name);
  const storagePath = `assets/${id}/${filename}`;

  if (asset.photoStoragePath && asset.photoStoragePath !== storagePath) {
    await access.supabase.storage
      .from(STORAGE_BUCKET)
      .remove([asset.photoStoragePath]);
  }

  const bytes = Buffer.from(await uploaded.arrayBuffer());
  const { error: uploadError } = await access.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        success: false,
        message: uploadError.message || "Impossibile caricare la foto.",
      },
      { status: 400 },
    );
  }

  const updated = await updateFixedAsset(access.supabase, id, {
    name: asset.name,
    quantity: asset.quantity,
    brand: asset.brand,
    model: asset.model,
    serial: asset.serial,
    accessories: asset.accessories,
    purchasedAt: asset.purchasedAt,
    locationPreset: asset.locationPreset,
    locationCustom: asset.locationCustom,
    notes: asset.notes,
    photoStoragePath: storagePath,
    updatedBy: access.member.id,
  });

  if (!updated.success) {
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

  const asset = await getFixedAssetById(access.supabase, id);
  if (!asset) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  if (asset.photoStoragePath) {
    await access.supabase.storage
      .from(STORAGE_BUCKET)
      .remove([asset.photoStoragePath]);
  }

  const updated = await updateFixedAsset(access.supabase, id, {
    name: asset.name,
    quantity: asset.quantity,
    brand: asset.brand,
    model: asset.model,
    serial: asset.serial,
    accessories: asset.accessories,
    purchasedAt: asset.purchasedAt,
    locationPreset: asset.locationPreset,
    locationCustom: asset.locationCustom,
    notes: asset.notes,
    photoStoragePath: null,
    updatedBy: access.member.id,
  });

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
