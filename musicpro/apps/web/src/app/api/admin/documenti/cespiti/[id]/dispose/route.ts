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

  const db = access.serviceSupabase;
  if (!db) {
    return NextResponse.json(
      { success: false, message: "Configurazione server incompleta." },
      { status: 500 },
    );
  }
  const openListing = await db
    .from("market_listings")
    .select("id, status")
    .eq("fixed_asset_id", id)
    .in("status", ["bozza", "in_vendita", "riservato"])
    .maybeSingle();
  if (openListing.data?.status === "riservato") {
    return NextResponse.json(
      {
        success: false,
        message: "C'è una richiesta Market aperta. Chiudila prima di dismettere.",
      },
      { status: 400 },
    );
  }
  if (openListing.data) {
    await db
      .from("market_listings")
      .update({ status: "bozza" })
      .eq("id", openListing.data.id);
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
