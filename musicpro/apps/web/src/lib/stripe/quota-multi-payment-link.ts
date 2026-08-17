import {
  getStripeConfig,
  type StripeConfig,
} from "@/lib/iscrizione/stripe-config";
import { eurosToCents } from "@/lib/stripe/room-payment-link";

export interface QuotaMultiPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  totaleCents?: number;
  message?: string;
}

function buildQuotaMultiPayReturnUrl(baseUrl: string, bandId?: string): string {
  const safeBase = baseUrl.trim().replace(/[?&]$/, "");
  const sep = safeBase.includes("?") ? "&" : "?";
  const q = new URLSearchParams({ dopoPagamento: "1" });
  if (bandId) {
    q.set("bandId", bandId);
  }
  return `${safeBase}${sep}${q.toString()}`;
}

export async function createStripePaymentLinkQuotaMultiPay(opts: {
  quotaPaymentId: string;
  paidByMemberId: string;
  memberIds: string[];
  fiscalYear: number;
  totalAmountEur: number;
  memberCount: number;
  returnBaseUrl?: string;
  bandId?: string;
  idempotencyKey?: string;
}): Promise<QuotaMultiPaymentLinkResult> {
  const cfg = getStripeConfig();
  const quotaPaymentId = String(opts.quotaPaymentId || "").trim();
  const paidByMemberId = String(opts.paidByMemberId || "").trim();

  if (!quotaPaymentId) {
    return { success: false, message: "ID pagamento quota mancante." };
  }
  if (!paidByMemberId) {
    return { success: false, message: "ID associato pagante mancante." };
  }

  const importoCents = eurosToCents(opts.totalAmountEur);
  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo quota non valido." };
  }

  const importoDisplay = (importoCents / 100).toFixed(2);
  const memberCount = Math.max(1, opts.memberCount);
  const returnBase = (opts.returnBaseUrl || cfg.returnBase).trim();
  const returnUrl = buildQuotaMultiPayReturnUrl(returnBase, opts.bandId);
  const memberIdsCsv = opts.memberIds.join(",");

  const body = new URLSearchParams({
    "line_items[0][price_data][currency]": cfg.currency,
    "line_items[0][price_data][unit_amount]": String(importoCents),
    "line_items[0][price_data][product_data][name]": `Quota associativa ${opts.fiscalYear} x ${memberCount} membri`,
    "line_items[0][quantity]": "1",
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": returnUrl,
    "metadata[mp_flow]": "quota_multi_pay",
    "metadata[mp_quota_payment_id]": quotaPaymentId,
    "metadata[mp_paid_by_member_id]": paidByMemberId,
    "metadata[mp_member_ids]": memberIdsCsv,
    "metadata[mp_totale]": importoDisplay,
    "metadata[mp_ambiente]": cfg.mode,
    "payment_intent_data[metadata][mp_flow]": "quota_multi_pay",
    "payment_intent_data[metadata][mp_quota_payment_id]": quotaPaymentId,
    "payment_intent_data[metadata][mp_paid_by_member_id]": paidByMemberId,
    "payment_intent_data[metadata][mp_member_ids]": memberIdsCsv,
    client_reference_id: quotaPaymentId,
  });

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
      totaleCents: importoCents,
    };
  }

  const msg = data.error?.message || `Errore Stripe HTTP ${resp.status}`;
  return { success: false, message: msg };
}

export type { StripeConfig };
