import { NextResponse } from "next/server";

import { setMarketOrderStatus } from "@musicpro/database";

import { marketErrorResponse, requireMarketAccess } from "@/lib/admin/market-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireMarketAccess();
  if (access.error) return access.error;
  const { id } = await context.params;

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
    await setMarketOrderStatus(access.supabase, id, body.status);
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketErrorResponse(error);
  }
}
