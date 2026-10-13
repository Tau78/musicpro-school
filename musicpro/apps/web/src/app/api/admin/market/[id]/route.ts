import { NextResponse } from "next/server";

import {
  deleteMarketListing,
  parseMarketPriceEuros,
  updateMarketListing,
} from "@musicpro/database";

import { marketErrorResponse, requireMarketAccess } from "@/lib/admin/market-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireMarketAccess();
  if (access.error) return access.error;
  const { id } = await context.params;

  let body: {
    title?: string;
    description?: string;
    price?: string;
    status?: "bozza" | "in_vendita";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const patch: {
    title?: string;
    description?: string;
    priceCents?: number;
    status?: "bozza" | "in_vendita";
  } = {};
  if (body.title != null) patch.title = body.title;
  if (body.description != null) patch.description = body.description;
  if (body.status === "bozza" || body.status === "in_vendita") {
    patch.status = body.status;
  }
  if (body.price != null) {
    const priceCents = parseMarketPriceEuros(String(body.price));
    if (priceCents == null) {
      return NextResponse.json(
        { success: false, message: "Prezzo non valido." },
        { status: 400 },
      );
    }
    patch.priceCents = priceCents;
  }

  try {
    await updateMarketListing(access.supabase, id, patch);
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const access = await requireMarketAccess();
  if (access.error) return access.error;
  const { id } = await context.params;

  try {
    const photoPath = await deleteMarketListing(access.supabase, id);
    if (photoPath) {
      await access.supabase.storage.from("website").remove([photoPath]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketErrorResponse(error);
  }
}
