import { NextRequest, NextResponse } from "next/server";

import { createQuotaPaymentCheckout } from "@musicpro/database";

import { authPublicOrigin, isLocalDevOrigin } from "@/lib/auth/redirect-url";
import { createStripePaymentLinkQuotaMultiPay } from "@/lib/stripe/quota-multi-payment-link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface QuotaPaymentsBody {
  memberIds?: string[];
  bandId?: string;
  fiscalYear?: number;
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
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, message: "Profilo associato non trovato." },
        { status: 403 },
      );
    }

    let body: QuotaPaymentsBody;
    try {
      body = (await request.json()) as QuotaPaymentsBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const memberIds = (body.memberIds ?? [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    if (memberIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Seleziona almeno un membro." },
        { status: 400 },
      );
    }

    const checkout = await createQuotaPaymentCheckout(supabase, {
      memberIds,
      fiscalYear: body.fiscalYear,
    });

    if (
      !checkout.success ||
      !checkout.quotaPaymentId ||
      checkout.totalAmountEur == null ||
      checkout.fiscalYear == null
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            checkout.errorMessage ?? "Impossibile avviare il pagamento quota.",
        },
        { status: 400 },
      );
    }

    const requestOrigin =
      request.headers.get("origin") || request.nextUrl.origin || "";
    const origin =
      requestOrigin && !isLocalDevOrigin(requestOrigin)
        ? requestOrigin.replace(/\/$/, "")
        : authPublicOrigin(process.env);

    const bandId = String(body.bandId || "").trim();
    const returnBase = bandId
      ? `${origin.replace(/\/$/, "")}/dashboard/band/${bandId}`
      : `${origin.replace(/\/$/, "")}/dashboard/band`;

    const linkRes = await createStripePaymentLinkQuotaMultiPay({
      quotaPaymentId: checkout.quotaPaymentId,
      paidByMemberId: member.id,
      memberIds,
      fiscalYear: checkout.fiscalYear,
      totalAmountEur: checkout.totalAmountEur,
      memberCount: checkout.memberCount ?? memberIds.length,
      returnBaseUrl: returnBase,
      bandId: bandId || undefined,
      idempotencyKey: `quota-multi-${checkout.quotaPaymentId}`,
    });

    if (!linkRes.success || !linkRes.url) {
      return NextResponse.json(
        {
          success: false,
          message: linkRes.message ?? "Impossibile creare il link di pagamento.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      url: linkRes.url,
      quotaPaymentId: checkout.quotaPaymentId,
      totalAmountEur: checkout.totalAmountEur,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
