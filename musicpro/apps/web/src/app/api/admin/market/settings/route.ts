import { NextResponse } from "next/server";

import { saveMarketPaymentSettings } from "@musicpro/database";

import { marketErrorResponse, requireMarketAccess } from "@/lib/admin/market-auth";
import { canManageShop } from "@/lib/admin/roles";

export async function PUT(request: Request) {
  const access = await requireMarketAccess();
  if (access.error || !access.member) return access.error;
  if (!canManageShop(access.member.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato." },
      { status: 403 },
    );
  }

  let body: { iban?: string; holder?: string };
  try {
    body = (await request.json()) as { iban?: string; holder?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  try {
    await saveMarketPaymentSettings(access.supabase, {
      iban: String(body.iban ?? ""),
      holder: String(body.holder ?? ""),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketErrorResponse(error);
  }
}
