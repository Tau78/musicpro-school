import { NextResponse } from "next/server";

import { setMarketOrderStatus } from "@musicpro/database";

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

  const { data: order } = await access.supabase
    .from("market_orders")
    .select("listing_id")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json(
      { success: false, message: "Richiesta non trovata." },
      { status: 404 },
    );
  }
  const blocked = await rejectPersonalMarketEdit(
    access.supabase,
    access.member.roles,
    order.listing_id,
  );
  if (blocked) return blocked;

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  if (body.status !== "pagato" && body.status !== "ritirato" && body.status !== "annullato") {
    return NextResponse.json(
      { success: false, message: "Stato non valido." },
      { status: 400 },
    );
  }

  try {
    await setMarketOrderStatus(access.supabase, id, body.status, access.member.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketErrorResponse(error);
  }
}
