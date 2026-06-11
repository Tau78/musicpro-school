import {
  buildQuotaReturnUrl,
  getStripeConfig,
  type StripeConfig,
} from "./stripe-config";

export const QUOTA_ASSOCIATIVA_CENTESIMI = 1500;

export interface PaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  totaleCents?: number;
  message?: string;
}

export async function createStripePaymentLinkQuotaAssociativa(opts: {
  idIscrizione: string;
  nome: string;
  cognome: string;
  importoCentesimi?: number;
  annoSocietario?: number;
  idempotencyKey?: string;
}): Promise<PaymentLinkResult> {
  const cfg = getStripeConfig();
  const idIscrizione = String(opts.idIscrizione || "").trim();
  if (!idIscrizione) {
    return { success: false, message: "ID iscrizione mancante." };
  }

  const importoCents =
    opts.importoCentesimi != null
      ? parseInt(String(opts.importoCentesimi), 10)
      : QUOTA_ASSOCIATIVA_CENTESIMI;

  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo quota non valido." };
  }

  const anno =
    opts.annoSocietario != null
      ? parseInt(String(opts.annoSocietario), 10)
      : new Date().getFullYear();
  const nome = String(opts.nome || "").trim();
  const cognome = String(opts.cognome || "").trim();
  const importoDisplay = (importoCents / 100).toFixed(2);

  const returnUrl = buildQuotaReturnUrl(cfg.returnBase, {
    idIscrizione,
    nome,
    cognome,
    importo: importoDisplay,
  });

  const body = new URLSearchParams({
    "line_items[0][price_data][currency]": cfg.currency,
    "line_items[0][price_data][unit_amount]": String(importoCents),
    "line_items[0][price_data][product_data][name]": `Quota associativa ${anno}`,
    "line_items[0][quantity]": "1",
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": returnUrl,
    "metadata[mp_flow]": "quota_associativa",
    "metadata[mp_id_iscrizione]": idIscrizione,
    "payment_intent_data[metadata][mp_flow]": "quota_associativa",
    "payment_intent_data[metadata][mp_id_iscrizione]": idIscrizione,
    "metadata[mp_nome]": nome,
    "metadata[mp_cognome]": cognome,
    "metadata[mp_totale]": importoDisplay,
    "metadata[mp_ambiente]": cfg.mode,
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

  const msg =
    data.error?.message || `Errore Stripe HTTP ${resp.status}`;
  return { success: false, message: msg };
}

export async function syncStripePaymentForEnrollment(
  cfg: StripeConfig,
  idIscrizione: string,
  paymentLinkId: string,
): Promise<{ pagato: boolean; synced?: boolean; piId?: string }> {
  const plId = String(paymentLinkId || "").trim();
  if (!plId) return { pagato: false };

  const url = `https://api.stripe.com/v1/checkout/sessions?payment_link=${encodeURIComponent(plId)}&limit=10`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.secret}` },
  });

  if (!resp.ok) return { pagato: false };

  const body = (await resp.json()) as {
    data?: Array<{
      payment_status?: string;
      metadata?: Record<string, string>;
      payment_intent?: string | { id?: string };
    }>;
  };

  const sessions = body.data ?? [];
  for (const session of sessions) {
    if (String(session.payment_status || "").toLowerCase() !== "paid") continue;

    const metaId = String(session.metadata?.mp_id_iscrizione || "").trim();
    if (metaId && metaId !== idIscrizione) continue;

    const piRef = session.payment_intent;
    const piId =
      typeof piRef === "string"
        ? piRef
        : piRef && typeof piRef === "object"
          ? String(piRef.id || "")
          : "";

    return { pagato: true, synced: true, piId };
  }

  return { pagato: false };
}
