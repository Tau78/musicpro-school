import { NextRequest, NextResponse } from "next/server";

import {
  createQuotaPaymentCheckout,
  getCurrentMemberWithRoles,
} from "@musicpro/database";

import { canManageQuotas } from "@/lib/admin/roles";
import { authPublicOrigin, isLocalDevOrigin } from "@/lib/auth/redirect-url";
import { createStripePaymentLinkQuotaMultiPay } from "@/lib/stripe/quota-multi-payment-link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  memberId?: string;
  fiscalYear?: number;
}

/**
 * Crea un link Stripe di pagamento quota per un associato (staff only).
 * Estende create_quota_payment_checkout (admin/segreteria autorizzati via migration 071).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const current = await getCurrentMemberWithRoles(supabase);

    if (!current || !canManageQuotas(current.roles)) {
      return NextResponse.json(
        { success: false, message: "Non autorizzato." },
        { status: 403 },
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const memberId = String(body.memberId || "").trim();
    if (!memberId) {
      return NextResponse.json(
        { success: false, message: "Associato mancante." },
        { status: 400 },
      );
    }

    const checkout = await createQuotaPaymentCheckout(supabase, {
      memberIds: [memberId],
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
            checkout.errorMessage ?? "Impossibile creare il pagamento quota.",
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
    const returnBase = `${origin.replace(/\/$/, "")}/dashboard`;

    const linkRes = await createStripePaymentLinkQuotaMultiPay({
      quotaPaymentId: checkout.quotaPaymentId,
      paidByMemberId: current.id,
      memberIds: [memberId],
      fiscalYear: checkout.fiscalYear,
      totalAmountEur: checkout.totalAmountEur,
      memberCount: 1,
      returnBaseUrl: returnBase,
      idempotencyKey: `admin-quota-${checkout.quotaPaymentId}`,
    });

    if (!linkRes.success || !linkRes.url) {
      return NextResponse.json(
        {
          success: false,
          message: linkRes.message ?? "Impossibile creare il link Stripe.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      url: linkRes.url,
      quotaPaymentId: checkout.quotaPaymentId,
      totalAmountEur: checkout.totalAmountEur,
      fiscalYear: checkout.fiscalYear,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
