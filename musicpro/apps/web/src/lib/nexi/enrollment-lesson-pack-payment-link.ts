import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { QUOTA_ASSOCIATIVA_CENTESIMI, eurosToCents } from "@/lib/nexi/cod-trans";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";
import { buildQuotaReturnUrl, iscrizioneReturnBase } from "@/lib/nexi/return-urls";

import type { LessonPackPaymentLinkResult } from "./lesson-pack-payment-link";

const REUSABLE_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function findReusableEnrollmentLessonPackPayment(opts: {
  enrollmentId: string;
  intentId: string;
  memberId: string;
  amountEur: number;
  includeQuota: boolean;
}): Promise<{
  paymentId: string;
  url: string;
  stripeId?: string | null;
  reused: true;
} | null> {
  const enrollmentId = String(opts.enrollmentId || "").trim();
  const intentId = String(opts.intentId || "").trim();
  const memberId = String(opts.memberId || "").trim();
  if (!enrollmentId || !intentId || !memberId) return null;

  const targetCents = eurosToCents(opts.amountEur);
  if (!Number.isFinite(targetCents) || targetCents < 50) return null;

  const service = createServiceRoleClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: candidates, error } = await service
    .from("lesson_pack_payments")
    .select(
      "id, amount_eur, stripe_payment_link_url, stripe_payment_link_id, created_at, status",
    )
    .eq("member_id", memberId)
    .eq("enrollment_lesson_intent_id", intentId)
    .eq("status", "pending")
    .eq("method", "nexi")
    .eq("include_quota", opts.includeQuota)
    .not("stripe_payment_link_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !candidates?.length) return null;

  for (const row of candidates) {
    if (eurosToCents(Number(row.amount_eur)) !== targetCents) continue;
    const packUrl = String(row.stripe_payment_link_url || "").trim();
    if (!packUrl) continue;

    const { data: order } = await service
      .from("nexi_payment_orders")
      .select(
        "provider_payment_id, payment_link_url, expires_at, metadata, created_at",
      )
      .eq("lesson_pack_payment_id", row.id)
      .eq("flow", "lesson_pack")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) continue;

    const meta =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    const orderEnrollment = String(
      meta.mp_iscrizione_enrollment_id || meta.mp_enrollment_id || "",
    ).trim();
    if (orderEnrollment !== enrollmentId) continue;

    if (order.expires_at) {
      if (String(order.expires_at) <= nowIso) continue;
    } else {
      const createdMs = new Date(
        String(order.created_at || row.created_at),
      ).getTime();
      if (
        !Number.isFinite(createdMs) ||
        now - createdMs > REUSABLE_PENDING_MAX_AGE_MS
      ) {
        continue;
      }
    }

    const url = String(order.payment_link_url || packUrl).trim();
    if (!url) continue;

    return {
      paymentId: row.id,
      url,
      stripeId:
        String(order.provider_payment_id || "").trim() ||
        row.stripe_payment_link_id,
      reused: true,
    };
  }

  return null;
}

/** Nexi pacchetto (+ quota opzionale) durante iscrizione associativa (senza course_enrollment). */
export async function createEnrollmentLessonPackPaymentLink(opts: {
  paymentId: string;
  enrollmentLessonIntentId: string;
  iscrizioneEnrollmentId: string;
  memberId: string;
  nome: string;
  cognome: string;
  packAmountEur: number;
  includeQuota: boolean;
  quotaAmountCents?: number;
  returnBaseUrl?: string;
  email?: string | null;
  idempotencyKey?: string;
}): Promise<LessonPackPaymentLinkResult> {
  const paymentId = String(opts.paymentId || "").trim();
  const intentId = String(opts.enrollmentLessonIntentId || "").trim();
  const enrollmentId = String(opts.iscrizioneEnrollmentId || "").trim();
  const memberId = String(opts.memberId || "").trim();

  if (!paymentId) {
    return { success: false, message: "ID pagamento mancante." };
  }
  if (!intentId) {
    return { success: false, message: "Intent lezioni mancante." };
  }
  if (!enrollmentId) {
    return { success: false, message: "ID iscrizione associativa mancante." };
  }
  if (!memberId) {
    return { success: false, message: "ID associato mancante." };
  }

  const packCents = eurosToCents(opts.packAmountEur);
  if (!Number.isFinite(packCents) || packCents < 50) {
    return { success: false, message: "Importo pacchetto non valido." };
  }

  const quotaCents = opts.includeQuota
    ? opts.quotaAmountCents != null
      ? parseInt(String(opts.quotaAmountCents), 10)
      : QUOTA_ASSOCIATIVA_CENTESIMI
    : 0;

  if (opts.includeQuota && (!Number.isFinite(quotaCents) || quotaCents < 50)) {
    return { success: false, message: "Importo quota non valido." };
  }

  const totaleCents = packCents + quotaCents;
  const nome = String(opts.nome || "").trim();
  const cognome = String(opts.cognome || "").trim();
  const importoDisplay = (totaleCents / 100).toFixed(2);
  const returnBase = (opts.returnBaseUrl || iscrizioneReturnBase()).trim();

  const returnUrl = buildQuotaReturnUrl(returnBase, {
    idIscrizione: enrollmentId,
    nome,
    cognome,
    importo: importoDisplay,
  });

  const description = opts.includeQuota
    ? "Iscrizione: pacchetto lezioni + quota associativa"
    : "Iscrizione: pacchetto lezioni";

  return mintNexiPayment({
    flow: "lesson_pack",
    amountCents: totaleCents,
    returnUrl,
    description,
    firstName: nome,
    lastName: cognome,
    email: opts.email,
    enrollmentId,
    memberId,
    lessonPackPaymentId: paymentId,
    metadata: {
      mp_flow: "lesson_pack",
      mp_payment_id: paymentId,
      mp_iscrizione_enrollment_id: enrollmentId,
      mp_enrollment_lesson_intent_id: intentId,
      mp_member_id: memberId,
      include_quota: opts.includeQuota,
      iscrizione_combined: true,
    },
  });
}
