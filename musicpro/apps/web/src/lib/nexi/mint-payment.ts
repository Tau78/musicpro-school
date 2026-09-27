import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { generateCodTrans, nexiPublicPayPageUrl } from "./cod-trans";

export type NexiFlow =
  | "quota_associativa"
  | "quota_multi_pay"
  | "room_booking"
  | "shop_credit_package"
  | "lesson_pack";

export interface PaymentLinkResult {
  success: boolean;
  url?: string;
  paymentId?: string;
  /** @deprecated alias di paymentId (codTrans) */
  stripeId?: string;
  totaleCents?: number;
  message?: string;
}

export type MintNexiPaymentOpts = {
  flow: NexiFlow;
  amountCents: number;
  returnUrl: string;
  description: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  enrollmentId?: string | null;
  quotaPaymentId?: string | null;
  bookingId?: string | null;
  memberId?: string | null;
  packageId?: string | null;
  lessonPackPaymentId?: string | null;
  metadata?: Record<string, unknown>;
};

function asJson(value: Record<string, unknown>) {
  return value as unknown as import("@musicpro/database").Database["public"]["Tables"]["nexi_payment_orders"]["Insert"]["metadata"];
}

export async function mintNexiPayment(
  opts: MintNexiPaymentOpts,
): Promise<PaymentLinkResult> {
  const amountCents = Math.round(Number(opts.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return { success: false, message: "Importo non valido." };
  }

  const flow = opts.flow;
  const service = createServiceRoleClient();

  let existing: {
    id: string;
    provider_payment_id: string | null;
    payment_link_url: string | null;
    status: string | null;
    metadata: unknown;
  } | null = null;

  if (flow !== "shop_credit_package") {
    let existingQuery = service
      .from("nexi_payment_orders")
      .select("id, provider_payment_id, payment_link_url, status, metadata")
      .eq("flow", flow)
      .eq("status", "pending")
      .limit(1);

    if (opts.enrollmentId) {
      existingQuery = existingQuery.eq("enrollment_id", opts.enrollmentId);
    } else if (opts.quotaPaymentId) {
      existingQuery = existingQuery.eq("quota_payment_id", opts.quotaPaymentId);
    } else if (opts.bookingId) {
      existingQuery = existingQuery.eq("booking_id", opts.bookingId);
    } else if (opts.lessonPackPaymentId) {
      existingQuery = existingQuery.eq(
        "lesson_pack_payment_id",
        opts.lessonPackPaymentId,
      );
    } else {
      existingQuery = existingQuery.eq(
        "id",
        "00000000-0000-0000-0000-000000000000",
      );
    }

    const found = await existingQuery.maybeSingle();
    existing = found.data;
  }

  const codTrans = generateCodTrans();
  const paymentLinkUrl = nexiPublicPayPageUrl(codTrans);
  const nowIso = new Date().toISOString();
  const previousMeta =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const previousHistory = Array.isArray(previousMeta.cod_trans_history)
    ? previousMeta.cod_trans_history
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    : [];
  const oldCod = String(existing?.provider_payment_id ?? "").trim();
  if (oldCod && oldCod !== codTrans) previousHistory.push(oldCod);

  const metadata = asJson({
    ...previousMeta,
    ...(opts.metadata ?? {}),
    cod_trans: codTrans,
    cod_trans_history: [...new Set(previousHistory)].slice(-30),
    payment_link_created_at: nowIso,
  });

  const row = {
    flow,
    provider_payment_id: codTrans,
    amount_cents: amountCents,
    status: "pending" as const,
    payment_link_url: paymentLinkUrl,
    return_url: opts.returnUrl,
    email: opts.email?.trim() || null,
    first_name: opts.firstName?.trim() || null,
    last_name: opts.lastName?.trim() || null,
    description: opts.description.trim().slice(0, 200),
    enrollment_id: opts.enrollmentId || null,
    quota_payment_id: opts.quotaPaymentId || null,
    booking_id: opts.bookingId || null,
    member_id: opts.memberId || null,
    package_id: opts.packageId || null,
    lesson_pack_payment_id: opts.lessonPackPaymentId || null,
    metadata,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: nowIso,
  };

  if (existing?.id) {
    const { error } = await service
      .from("nexi_payment_orders")
      .update(row)
      .eq("id", existing.id);
    if (error) {
      return {
        success: false,
        message: error.message || "Impossibile aggiornare il pagamento.",
      };
    }
  } else {
    const { error } = await service.from("nexi_payment_orders").insert(row);
    if (error) {
      return {
        success: false,
        message: error.message || "Impossibile creare il pagamento.",
      };
    }
  }

  return {
    success: true,
    url: paymentLinkUrl,
    paymentId: codTrans,
    stripeId: codTrans,
    totaleCents: amountCents,
  };
}

export async function syncNexiPaymentForEnrollment(
  idIscrizione: string,
  paymentLinkId: string,
): Promise<{ pagato: boolean; synced?: boolean; piId?: string }> {
  const enrollmentId = String(idIscrizione || "").trim();
  const codTrans = String(paymentLinkId || "").trim();
  if (!enrollmentId && !codTrans) return { pagato: false };

  const service = createServiceRoleClient();

  if (codTrans) {
    const { data: receipt } = await service
      .from("nexi_payment_receipts")
      .select("cod_trans")
      .eq("cod_trans", codTrans)
      .maybeSingle();
    if (receipt) {
      return { pagato: true, synced: true, piId: codTrans };
    }
  }

  let orderQuery = service
    .from("nexi_payment_orders")
    .select("status, provider_payment_id")
    .eq("flow", "quota_associativa")
    .limit(1);

  if (enrollmentId) orderQuery = orderQuery.eq("enrollment_id", enrollmentId);
  else orderQuery = orderQuery.eq("provider_payment_id", codTrans);

  const { data: order } = await orderQuery.maybeSingle();
  if (order?.status === "paid") {
    return {
      pagato: true,
      synced: true,
      piId: String(order.provider_payment_id || codTrans),
    };
  }

  return { pagato: false };
}
