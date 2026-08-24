import { NextResponse } from "next/server";

import { findDuplicateMatches, type FixedAssetInput } from "@musicpro/database";

import { requireCespitiAccess } from "@/lib/admin/cespiti-auth";

interface CheckBody extends FixedAssetInput {
  excludeId?: string;
}

export async function POST(request: Request) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  let body: CheckBody;
  try {
    body = (await request.json()) as CheckBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const { excludeId, ...input } = body;
  const duplicates = await findDuplicateMatches(
    access.supabase,
    input,
    excludeId,
  );

  return NextResponse.json({
    success: true,
    hasDuplicates: duplicates.length > 0,
    duplicates,
  });
}
