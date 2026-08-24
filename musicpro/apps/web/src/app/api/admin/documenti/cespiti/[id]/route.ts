import { NextResponse } from "next/server";

import {
  getFixedAssetById,
  hardDeleteFixedAsset,
  listFixedAssetEvents,
  markDisposedFixedAsset,
  softDeleteFixedAsset,
  type FixedAssetInput,
} from "@musicpro/database";

import {
  CESPITI_STORAGE_BUCKET,
  requireCespitiAccess,
  signedPhotoUrl,
} from "@/lib/admin/cespiti-auth";
import { updateFixedAssetHandlingDuplicates } from "@/lib/admin/cespiti-mutations";

const STORAGE_BUCKET = CESPITI_STORAGE_BUCKET;

type RouteContext = {
  params: Promise<{ id: string }>;
};

interface UpdateBody extends FixedAssetInput {
  forceDuplicate?: boolean;
}

async function removePhotoIfPresent(
  supabase: Awaited<ReturnType<typeof requireCespitiAccess>>["supabase"],
  photoStoragePath: string | null,
) {
  if (!photoStoragePath) return;
  await supabase.storage.from(STORAGE_BUCKET).remove([photoStoragePath]);
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  try {
    const asset = await getFixedAssetById(access.supabase, id);
    if (!asset) {
      return NextResponse.json(
        { success: false, message: "Cespite non trovato" },
        { status: 404 },
      );
    }

    const [photoUrl, events] = await Promise.all([
      signedPhotoUrl(access.supabase, asset.photoStoragePath),
      listFixedAssetEvents(access.supabase, id),
    ]);

    return NextResponse.json({
      success: true,
      asset: { ...asset, photoUrl },
      events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Impossibile caricare il cespite.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const existing = await getFixedAssetById(access.supabase, id);
  if (!existing) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  const { forceDuplicate, ...input } = body;
  const result = await updateFixedAssetHandlingDuplicates(
    access.supabase,
    id,
    input,
    {
      forceDuplicate: forceDuplicate === true,
      actorMemberId: access.member.id,
      excludeId: id,
    },
  );

  if (!result.ok) {
    if (result.status === 409) {
      return NextResponse.json(
        {
          success: false,
          duplicates: result.duplicates,
          duplicateMatches: result.duplicates,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json({ success: true, id: result.id });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const mode = new URL(request.url).searchParams.get("mode") ?? "soft";
  const asset = await getFixedAssetById(access.supabase, id);
  if (!asset) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  let result;
  if (mode === "hard") {
    if (!access.isAdmin) {
      return NextResponse.json(
        { success: false, message: "Solo gli admin possono eliminare definitivamente." },
        { status: 403 },
      );
    }
    result = await hardDeleteFixedAsset(access.supabase, id);
    if (result.success) {
      await removePhotoIfPresent(access.supabase, asset.photoStoragePath);
    }
  } else if (mode === "disposed") {
    result = await markDisposedFixedAsset(
      access.supabase,
      id,
      undefined,
      access.member.id,
    );
  } else if (mode === "soft") {
    result = await softDeleteFixedAsset(
      access.supabase,
      id,
      access.member.id,
    );
  } else {
    return NextResponse.json(
      { success: false, message: "Mode non valido (soft, hard, disposed)" },
      { status: 400 },
    );
  }

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage ?? "Impossibile eliminare il cespite.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id, mode });
}
