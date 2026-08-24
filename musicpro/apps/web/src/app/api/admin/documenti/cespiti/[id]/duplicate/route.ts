import { NextResponse } from "next/server";

import { duplicateFixedAsset, getFixedAssetById } from "@musicpro/database";

import { requireCespitiAccess } from "@/lib/admin/cespiti-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const source = await getFixedAssetById(access.supabase, id);
  if (!source) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato" },
      { status: 404 },
    );
  }

  const result = await duplicateFixedAsset(
    access.supabase,
    id,
    access.member.id,
  );

  if (!result.success || !result.id) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage ?? "Impossibile duplicare il cespite.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id: result.id, sourceId: id });
}
