import { NextResponse } from "next/server";

import { createMarketListing, parseMarketPriceEuros } from "@musicpro/database";

import { marketErrorResponse, requireMarketAccess } from "@/lib/admin/market-auth";

export async function POST(request: Request) {
  const access = await requireMarketAccess();
  if (access.error) return access.error;

  let body: { title?: string; price?: string };
  try {
    body = (await request.json()) as { title?: string; price?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const priceCents = parseMarketPriceEuros(String(body.price ?? ""));
  if (priceCents == null) {
    return NextResponse.json(
      { success: false, message: "Prezzo non valido." },
      { status: 400 },
    );
  }

  try {
    const listing = await createMarketListing(access.supabase, {
      title: String(body.title ?? ""),
      priceCents,
    });
    return NextResponse.json({ success: true, listing });
  } catch (error) {
    return marketErrorResponse(error);
  }
}
