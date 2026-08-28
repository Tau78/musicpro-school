import { NextResponse } from "next/server";

import {
  findDuplicateMatches,
  listFixedAssets,
  type FixedAssetInput,
  type LocationPreset,
} from "@musicpro/database";

import { requireCespitiAccess, withPhotoUrls } from "@/lib/admin/cespiti-auth";
import { createFixedAssetHandlingDuplicates } from "@/lib/admin/cespiti-mutations";

interface CreateBody extends FixedAssetInput {
  forceDuplicate?: boolean;
}

function parseListOptions(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get("location");
  const locationsParam = searchParams.get("locations");
  const locationsFromList = searchParams
    .getAll("location")
    .filter((value) => value.length > 0) as LocationPreset[];
  const locationsFromCsv =
    locationsParam && locationsParam.length > 0
      ? (locationsParam.split(",").filter(Boolean) as LocationPreset[])
      : undefined;
  const locations =
    locationsFromList.length > 0
      ? locationsFromList
      : locationsFromCsv && locationsFromCsv.length > 0
        ? locationsFromCsv
        : undefined;

  return {
    search: searchParams.get("search") ?? undefined,
    location:
      location && location.length > 0 ? (location as LocationPreset) : undefined,
    locations,
    includeDisposed: searchParams.get("includeDisposed") === "true",
    includeDeleted: searchParams.get("includeDeleted") === "true",
    withoutPhoto: searchParams.get("withoutPhoto") === "true",
    withoutSerial: searchParams.get("withoutSerial") === "true",
  };
}

export async function GET(request: Request) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  try {
    const assets = await listFixedAssets(access.supabase, parseListOptions(request));
    const assetsWithPhotos = await withPhotoUrls(access.supabase, assets);
    return NextResponse.json({ success: true, assets: assetsWithPhotos });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Impossibile caricare i cespiti.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const { forceDuplicate, ...input } = body;
  const result = await createFixedAssetHandlingDuplicates(
    access.serviceSupabase,
    input,
    {
      forceDuplicate: forceDuplicate === true,
      actorMemberId: access.member.id,
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

  return NextResponse.json({
    success: true,
    id: result.id,
    merged: result.merged === true,
  });
}
