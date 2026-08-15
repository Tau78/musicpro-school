import {
  buildCreditShopReturnUrl,
  getStripeConfig,
  type StripeConfig,
} from "@/lib/iscrizione/stripe-config";
import { eurosToCents } from "@/lib/stripe/room-payment-link";

export interface CreditShopPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  totaleCents?: number;
  message?: string;
}

export async function createStripePaymentLinkCreditShop(opts: {
  memberId: string;
  packageId: string;
  packageName: string;
  credits: number;
  priceEur: number;
  memberName?: string;
  idempotencyKey?: string;
  returnBaseUrl?: string;
}): Promise<CreditShopPaymentLinkResult> {
  const cfg = getStripeConfig();
  const memberId = String(opts.memberId || "").trim();
  const packageId = String(opts.packageId || "").trim();

  if (!memberId) {
    return { success: false, message: "ID associato mancante." };
  }
  if (!packageId) {
    return { success: false, message: "ID pacchetto mancante." };
  }

  const importoCents = eurosToCents(opts.priceEur);
  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo pacchetto non valido." };
  }

  const importoDisplay = (importoCents / 100).toFixed(2);
  const packageName = String(opts.packageName || "Pacchetto crediti").trim();
  const memberName = String(opts.memberName || "").trim();
  const returnBase = (opts.returnBaseUrl || cfg.returnBase).trim();
  const returnUrl = buildCreditShopReturnUrl(returnBase);

  const body = new URLSearchParams({
    "line_items[0][price_data][currency]": cfg.currency,
    "line_items[0][price_data][unit_amount]": String(importoCents),
    "line_items[0][price_data][product_data][name]": `${packageName} (${opts.credits} crediti)`,
    "line_items[0][quantity]": "1",
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": returnUrl,
    "metadata[mp_flow]": "shop_credit_package",
    "metadata[mp_package_id]": packageId,
    "metadata[mp_member_id]": memberId,
    "payment_intent_data[metadata][mp_flow]": "shop_credit_package",
    "payment_intent_data[metadata][mp_package_id]": packageId,
    "payment_intent_data[metadata][mp_member_id]": memberId,
    "metadata[mp_totale]": importoDisplay,
    "metadata[mp_ambiente]": cfg.mode,
    client_reference_id: `${memberId}:${packageId}`,
  });

  if (memberName) {
    body.set("metadata[mp_nome]", memberName);
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
      totaleCents: importoCents,
    };
  }

  const msg = data.error?.message || `Errore Stripe HTTP ${resp.status}`;
  return { success: false, message: msg };
}

export type { StripeConfig };
