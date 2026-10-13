import { NextResponse } from "next/server";

import {
  deleteMarketListing,
  parseMarketPriceEuros,
  updateMarketListing,
} from "@musicpro/database";

import {
  marketErrorResponse,
  rejectPersonalMarketEdit,
  requireMarketAccess,
} from "@/lib/admin/market-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireMarketAccess();
  if (access.error || !access.member) return access.error;
  const { id } = await context.params;
  const blocked = await rejectPersonalMarketEdit(
    access.supabase,
    access.member.roles,
    id,
  );
  if (blocked) return blocked;

  let body: {
    title?: string;
    description?: string;
    price?: string;
    status?: "bozza" | "in_revisione" | "rifiutato" | "in_vendita" | "venduto";
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
    status?: "bozza" | "in_revisione" | "rifiutato" | "in_vendita" | "venduto";
  } = {};
  if (body.title != null) patch.title = body.title;
  if (body.description != null) patch.description = body.description;
  if (
    body.status === "bozza" ||
    body.status === "in_revisione" ||
    body.status === "rifiutato" ||
    body.status === "in_vendita" ||
    body.status === "venduto"
  ) {
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
  if (access.error || !access.member) return access.error;
  const { id } = await context.params;
  const blocked = await rejectPersonalMarketEdit(
    access.supabase,
    access.member.roles,
    id,
  );
  if (blocked) return blocked;

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
