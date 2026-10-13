import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  parseMarketPriceEuros,
  updateAssociateListing,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return NextResponse.json({ success: false, message: "Non autenticato." }, { status: 401 });
  }
  const { id } = await context.params;

  let body: {
    title?: string;
    description?: string;
    price?: string;
    phone?: string;
    email?: string;
    handover?: string;
    sold?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Richiesta non valida." }, { status: 400 });
  }

  const patch: {
    title?: string;
    description?: string;
    priceCents?: number;
    phone?: string;
    email?: string;
    handover?: "sede" | "diretto";
    sold?: boolean;
  } = {};
  if (body.title != null) patch.title = body.title;
  if (body.description != null) patch.description = body.description;
  if (body.phone != null) patch.phone = body.phone;
  if (body.email != null) patch.email = body.email;
  if (body.handover === "sede" || body.handover === "diretto") patch.handover = body.handover;
  if (body.sold) patch.sold = true;
  if (body.price != null) {
    const priceCents = parseMarketPriceEuros(String(body.price));
    if (priceCents == null) {
      return NextResponse.json({ success: false, message: "Prezzo non valido." }, { status: 400 });
    }
    patch.priceCents = priceCents;
  }

  try {
    await updateAssociateListing(supabase, id, member.id, patch);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aggiornamento non riuscito.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return NextResponse.json({ success: false, message: "Non autenticato." }, { status: 401 });
  }
  const { id } = await context.params;
  const { error } = await supabase
    .from("market_listings")
    .delete()
    .eq("id", id)
    .eq("seller_member_id", member.id);
  if (error) {
    return NextResponse.json(
      { success: false, message: "Non puoi eliminare questo annuncio." },
      { status: 400 },
    );
  }
  return NextResponse.json({ success: true });
}
