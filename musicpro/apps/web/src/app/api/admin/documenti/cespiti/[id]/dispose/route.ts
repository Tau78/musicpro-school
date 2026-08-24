import { NextResponse } from "next/server";

import { getFixedAssetById, markDisposedFixedAsset } from "@musicpro/database";

import { requireCespitiAccess } from "@/lib/admin/cespiti-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;

  const { id } = await context.params;
  const asset = await getFixedAssetById(access.supabase, id);
  if (!asset) {
    return NextResponse.json(
      { success: false, message: "Cespite non trovato." },
      { status: 404 },
    );
  }

  const result = await markDisposedFixedAsset(
    access.supabase,
    id,
    undefined,
    access.member.id,
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, message: result.errorMessage ?? "Operazione non riuscita." },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id: result.id });
}
