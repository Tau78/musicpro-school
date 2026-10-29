import { NextResponse } from "next/server";

import { marketPhotoPublicUrl } from "@musicpro/database";

import { listEventiUsedMarketRows, mapEventiUsedRowToListing } from "@/lib/market/eventi-used-catalog";
import { marketCorsHeaders } from "@/lib/market/cors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: marketCorsHeaders(request) });
}

export async function GET(request: Request) {
  const headers = marketCorsHeaders(request);
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("market_listings")
      .select(
        "id, title, description, price_cents, photo_path, seller_kind, seller_name, seller_phone, seller_email, handover",
      )
      .eq("status", "in_vendita")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, message: "Catalogo non disponibile." },
        { status: 500, headers },
      );
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const eventiRows = await listEventiUsedMarketRows();
    const eventiItems = eventiRows.map((row) => {
      const listing = mapEventiUsedRowToListing(row);
      return {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        photoUrl: listing.photoUrl ?? null,
        sellerKind: listing.sellerKind,
        sellerName: null,
        sellerPhone: null,
        sellerEmail: null,
        handover: "sede" as const,
        categoryLabel: listing.categoryLabel ?? null,
        conditionLabel: listing.conditionLabel ?? null,
        source: "eventi_desk" as const,
      };
    });
    const items = [
      ...eventiItems,
      ...(data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priceCents: row.price_cents,
      photoUrl: marketPhotoPublicUrl(row.photo_path, base),
      sellerKind: row.seller_kind,
      sellerName: row.seller_kind === "associato" ? row.seller_name : null,
      sellerPhone: row.seller_kind === "associato" ? row.seller_phone : null,
      sellerEmail: row.seller_kind === "associato" ? row.seller_email : null,
      handover: row.seller_kind === "associato" ? row.handover : "sede",
      categoryLabel: null,
      conditionLabel: null,
      source: "school" as const,
    })),
    ];

    return NextResponse.json(
      { success: true, items },
      { headers: { ...headers, "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Catalogo non disponibile." },
      { status: 500, headers },
    );
  }
}
