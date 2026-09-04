import {
  getStripeConfig,
  type StripeConfig,
} from "@/lib/iscrizione/stripe-config";
import { QUOTA_ASSOCIATIVA_CENTESIMI } from "@/lib/iscrizione/stripe-payment-link";
import { eurosToCents } from "@/lib/stripe/room-payment-link";
import {
  authPublicOrigin,
  isLocalDevOrigin,
} from "@/lib/auth/redirect-url";

export const LESSON_PACK_FLOW = "lesson_pack";

export interface LessonPackPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  totaleCents?: number;
  message?: string;
}

function usablePublicUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isLocalDevOrigin(trimmed)) return "";
  return trimmed;
}

function buildLessonPackReturnUrl(
  cfgReturnBase: string,
  optsReturnUrl?: string,
): string {
  const explicit = usablePublicUrl(optsReturnUrl || "");
  if (explicit) return explicit;

  const envReturn = usablePublicUrl(
    process.env.STRIPE_RETURN_URL || cfgReturnBase || "",
  );
  if (envReturn) return envReturn;

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
  const importoDisplay = (totaleCents / 100).toFixed(2);
  const studentName = String(opts.studentName || "").trim();
  const anno = new Date().getFullYear();

  let cfg: StripeConfig;
  try {
    cfg = getStripeConfig();
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Configurazione Stripe mancante.",
    };
  }

  const returnUrl = buildLessonPackReturnUrl(cfg.returnBase, opts.returnUrl);

  const body = new URLSearchParams({
    "line_items[0][price_data][currency]": cfg.currency,
    "line_items[0][price_data][unit_amount]": String(packCents),
    "line_items[0][price_data][product_data][name]": "Pacchetto 4 lezioni",
    "line_items[0][quantity]": "1",
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": returnUrl,
    "metadata[mp_flow]": LESSON_PACK_FLOW,
    "metadata[mp_payment_id]": paymentId,
    "metadata[mp_enrollment_id]": enrollmentId,
    "metadata[mp_member_id]": memberId,
    "metadata[mp_totale]": importoDisplay,
    "metadata[mp_ambiente]": cfg.mode,
    "payment_intent_data[metadata][mp_flow]": LESSON_PACK_FLOW,
    "payment_intent_data[metadata][mp_payment_id]": paymentId,
    "payment_intent_data[metadata][mp_enrollment_id]": enrollmentId,
    "payment_intent_data[metadata][mp_member_id]": memberId,
    client_reference_id: paymentId,
  });

  if (opts.includeQuota) {
    body.set("line_items[1][price_data][currency]", cfg.currency);
    body.set("line_items[1][price_data][unit_amount]", String(quotaCents));
    body.set(
      "line_items[1][price_data][product_data][name]",
      `Quota associativa ${anno}`,
    );
    body.set("line_items[1][quantity]", "1");
  }

  if (studentName) {
    body.set("metadata[mp_nome]", studentName);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (opts.idempotencyKey) {
    const ik = String(opts.idempotencyKey)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .substring(0, 240);
    if (ik) headers["Idempotency-Key"] = ik;
  }

  const resp = await fetch("https://api.stripe.com/v1/payment_links", {
    method: "POST",
    headers,
    body,
  });

  const raw = await resp.text();
  let data: { url?: string; id?: string; error?: { message?: string } } = {};
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    /* ignore */
  }

  if (resp.ok && data.url) {
    return {
      success: true,
      url: String(data.url),
      stripeId: String(data.id || ""),
      totaleCents,
    };
  }

  const msg = data.error?.message || `Errore Stripe HTTP ${resp.status}`;
  return { success: false, message: msg };
}

export type { StripeConfig };
