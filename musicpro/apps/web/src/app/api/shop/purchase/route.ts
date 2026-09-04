import { NextRequest, NextResponse } from "next/server";

import { getCreditPackageById } from "@musicpro/database";

import { authPublicOrigin, isLocalDevOrigin } from "@/lib/auth/redirect-url";
import { createStripePaymentLinkCreditShop } from "@/lib/stripe/credit-shop-payment-link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PurchaseBody {
  packageId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Devi effettuare l'accesso." },
        { status: 401 },
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, message: "Profilo associato non trovato." },
        { status: 403 },
      );
    }

    let body: PurchaseBody;
    try {
      body = (await request.json()) as PurchaseBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const packageId = String(body.packageId || "").trim();
    if (!packageId) {
      return NextResponse.json(
        { success: false, message: "Pacchetto non specificato." },
        { status: 400 },
      );
    }

    const creditPackage = await getCreditPackageById(supabase, packageId);
    if (!creditPackage || !creditPackage.enabled) {
      return NextResponse.json(
        { success: false, message: "Pacchetto crediti non disponibile." },
        { status: 404 },
      );
    }

    const requestOrigin =
      request.headers.get("origin") || request.nextUrl.origin || "";
    const origin =
      requestOrigin && !isLocalDevOrigin(requestOrigin)
        ? requestOrigin.replace(/\/$/, "")
        : authPublicOrigin(process.env);

    const returnBase = `${origin.replace(/\/$/, "")}/dashboard/shop`;
    const memberName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();

    const linkRes = await createStripePaymentLinkCreditShop({
      memberId: member.id,
      packageId: creditPackage.id,
      packageName: creditPackage.name,
      credits: creditPackage.credits,
      priceEur: creditPackage.priceEur,
      memberName,
      returnBaseUrl: returnBase,
      idempotencyKey: `shop-${member.id}-${creditPackage.id}`,
    });

    if (!linkRes.success || !linkRes.url) {
      return NextResponse.json(
        {
          success: false,
          message: linkRes.message ?? "Impossibile avviare il pagamento.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, url: linkRes.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
