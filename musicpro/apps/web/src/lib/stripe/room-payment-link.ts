import {
  buildRoomBookingReturnUrl,
  getStripeConfig,
  type StripeConfig,
} from "@/lib/iscrizione/stripe-config";

export interface RoomPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  totaleCents?: number;
  message?: string;
}

export async function createStripePaymentLinkRoomBooking(opts: {
  bookingId: string;
  roomName: string;
  importoCentesimi: number;
  memberName?: string;
  idempotencyKey?: string;
  returnBaseUrl?: string;
}): Promise<RoomPaymentLinkResult> {
  const cfg = getStripeConfig();
  const bookingId = String(opts.bookingId || "").trim();
  if (!bookingId) {
    return { success: false, message: "ID prenotazione mancante." };
  }

  const importoCents = parseInt(String(opts.importoCentesimi), 10);
  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo prenotazione non valido." };
  }

  const importoDisplay = (importoCents / 100).toFixed(2);
  const roomName = String(opts.roomName || "Sala prova").trim();
  const memberName = String(opts.memberName || "").trim();
  const returnBase = (opts.returnBaseUrl || cfg.returnBase).trim();

  const returnUrl = buildRoomBookingReturnUrl(returnBase, {
    bookingId,
    importo: importoDisplay,
  });

  const body = new URLSearchParams({
    "line_items[0][price_data][currency]": cfg.currency,
    "line_items[0][price_data][unit_amount]": String(importoCents),
    "line_items[0][price_data][product_data][name]": `Prenotazione ${roomName}`,
    "line_items[0][quantity]": "1",
    "after_completion[type]": "redirect",
    "after_completion[redirect][url]": returnUrl,
    "metadata[mp_flow]": "room_booking",
    "metadata[mp_id_prenotazione]": bookingId,
    "payment_intent_data[metadata][mp_flow]": "room_booking",
    "payment_intent_data[metadata][mp_id_prenotazione]": bookingId,
    "metadata[mp_totale]": importoDisplay,
    "metadata[mp_ambiente]": cfg.mode,
    client_reference_id: bookingId,
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

export function eurosToCents(amountEur: number): number {
  return Math.round(amountEur * 100);
}

export type { StripeConfig };
