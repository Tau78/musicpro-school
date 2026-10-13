import { NextResponse } from "next/server";

import { marketPhotoPublicUrl } from "@musicpro/database";

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
      .select("id, title, description, price_cents, photo_path")
      .eq("status", "in_vendita")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, message: "Catalogo non disponibile." },
        { status: 500, headers },
      );
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const items = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priceCents: row.price_cents,
      photoUrl: marketPhotoPublicUrl(row.photo_path, base),
    }));

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
