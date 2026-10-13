import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { QUOTA_ASSOCIATIVA_CENTESIMI, eurosToCents } from "@/lib/nexi/cod-trans";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";
import {
  authPublicOrigin,
  isLocalDevOrigin,
} from "@/lib/auth/redirect-url";

export const LESSON_PACK_FLOW = "lesson_pack";

/** Max age for a reusable pending pack payment when nexi order has no expires_at. */
const REUSABLE_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LessonPackPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  paymentId?: string;
  totaleCents?: number;
  message?: string;
}

export interface ReusableLessonPackPayment {
  paymentId: string;
  url: string;
  stripeId?: string | null;
  reused: true;
}

/**
 * Idempotency: same member/family/enrollment/amount pending with a still-valid
 * Nexi link → reuse row + URL, do not INSERT or mint again.
 */
export async function findReusableLessonPackPayment(opts: {
  memberId: string;
  familyKey: string;
  enrollmentId: string;
  amountEur: number;
  includeQuota: boolean;
}): Promise<ReusableLessonPackPayment | null> {
  const memberId = String(opts.memberId || "").trim();
  const familyKey = String(opts.familyKey || "").trim();
  const enrollmentId = String(opts.enrollmentId || "").trim();
  if (!memberId || !familyKey || !enrollmentId) return null;

  const targetCents = eurosToCents(opts.amountEur);
  if (!Number.isFinite(targetCents) || targetCents < 50) return null;

  const service = createServiceRoleClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: candidates, error } = await service
    .from("lesson_pack_payments")
    .select(
      "id, amount_eur, stripe_payment_link_url, stripe_payment_link_id, created_at",
    )
    .eq("member_id", memberId)
    .eq("family_key", familyKey)
    .eq("status", "pending")
    .eq("method", "nexi")
    .eq("include_quota", opts.includeQuota)
    .not("stripe_payment_link_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

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
      .eq("flow", LESSON_PACK_FLOW)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) continue;

    const meta =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    const orderEnrollment = String(meta.mp_enrollment_id || "").trim();
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

function usablePublicUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isLocalDevOrigin(trimmed)) return "";
  return trimmed;
}

function buildLessonPackReturnUrl(optsReturnUrl?: string): string {
  const explicit = usablePublicUrl(optsReturnUrl || "");
  if (explicit) return explicit;
  return `${authPublicOrigin(process.env)}/admin/lezioni/rette?pagato=1`;
}

export async function createLessonPackPaymentLink(opts: {
  paymentId: string;
  enrollmentId: string;
  memberId: string;
  studentName: string;
  packAmountEur: number;
  includeQuota: boolean;
  quotaAmountCents?: number;
  returnUrl?: string;
  email?: string | null;
  idempotencyKey?: string;
}): Promise<LessonPackPaymentLinkResult> {
  const paymentId = String(opts.paymentId || "").trim();
  const enrollmentId = String(opts.enrollmentId || "").trim();
  const memberId = String(opts.memberId || "").trim();

  if (!paymentId) {
    return { success: false, message: "ID pagamento mancante." };
  }
  if (!enrollmentId) {
    return { success: false, message: "ID iscrizione corso mancante." };
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
  const studentName = String(opts.studentName || "").trim();
  const nameParts = studentName.split(/\s+/);
  const description = opts.includeQuota
    ? "Pacchetto lezioni + quota associativa"
    : "Pacchetto lezioni";

  return mintNexiPayment({
    flow: "lesson_pack",
    amountCents: totaleCents,
    returnUrl: buildLessonPackReturnUrl(opts.returnUrl),
    description,
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: opts.email,
    memberId,
    lessonPackPaymentId: paymentId,
    metadata: {
      mp_flow: LESSON_PACK_FLOW,
      mp_payment_id: paymentId,
      mp_enrollment_id: enrollmentId,
      mp_member_id: memberId,
      include_quota: opts.includeQuota,
    },
  });
}
