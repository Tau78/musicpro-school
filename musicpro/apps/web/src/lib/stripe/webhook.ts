import Stripe from "stripe";

import { getStripeConfig } from "@/lib/iscrizione/stripe-config";

export const PAID_STRIPE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
]);

export function getStripeWebhookSecret(): string {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET non configurato.");
  }
  return secret;
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
}

export function verifyStripeWebhookEvent(
  rawBody: string,
  signature: string | null,
): Stripe.Event {
  const secret = getStripeWebhookSecret();
  if (!signature) {
    throw new Error("Header Stripe-Signature mancante.");
  }

  const stripe = createStripeClient(getStripeConfig().secret);

  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export function metadataBookingRef(
  metadata: Stripe.Metadata | null | undefined,
): string {
  if (!metadata) return "";
  return String(
    metadata.mp_id_prenotazione ??
      metadata.idPrenotazione ??
      metadata.id_prenotazione ??
      "",
  ).trim();
}

export function metadataFlow(
  metadata: Stripe.Metadata | null | undefined,
): string {
  if (!metadata) return "";
  return String(metadata.mp_flow ?? "").trim();
}

function paymentIntentIdFromObject(
  obj: Stripe.Checkout.Session | Stripe.PaymentIntent,
): string {
  const pi =
    "payment_intent" in obj ? obj.payment_intent : (obj as Stripe.PaymentIntent).id;
  if (typeof pi === "string") return pi;
  if (pi && typeof pi === "object" && "id" in pi) return String(pi.id);
  return "";
}

function paymentLinkIdFromSession(session: Stripe.Checkout.Session): string {
  const pl = session.payment_link;
  if (typeof pl === "string") return pl;
  if (pl && typeof pl === "object" && "id" in pl) return String(pl.id);
  return "";
}

export async function resolveRoomBookingFromEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<{
  bookingRef: string;
  paymentIntentId: string;
  paymentLinkId: string;
  amountCents: number;
  flow: string;
}> {
  const obj = event.data.object;

  if (event.type.startsWith("checkout.session")) {
    const session = obj as Stripe.Checkout.Session;
    let bookingRef = metadataBookingRef(session.metadata ?? undefined);
    const flow = metadataFlow(session.metadata ?? undefined);
    const paymentIntentId = paymentIntentIdFromObject(session);
    const paymentLinkId = paymentLinkIdFromSession(session);
    let amountCents = Number(session.amount_total ?? 0);

    if (!bookingRef && paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      bookingRef = metadataBookingRef(pi.metadata);
      if (!amountCents) {
        amountCents = Number(pi.amount_received ?? pi.amount ?? 0);
      }
    }
    if (!bookingRef && session.client_reference_id) {
      bookingRef = String(session.client_reference_id).trim();
    }

    return { bookingRef, paymentIntentId, paymentLinkId, amountCents, flow };
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = obj as Stripe.PaymentIntent;
    const bookingRef = metadataBookingRef(pi.metadata);
    const flow = metadataFlow(pi.metadata);
    let paymentLinkId = "";

    if (pi.id) {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: pi.id,
        limit: 1,
      });
      if (sessions.data[0]) {
        paymentLinkId = paymentLinkIdFromSession(sessions.data[0]);
      }
    }

    return {
      bookingRef,
      paymentIntentId: pi.id ?? "",
      paymentLinkId,
      amountCents: Number(pi.amount_received ?? pi.amount ?? 0),
      flow,
    };
  }

  return {
    bookingRef: "",
    paymentIntentId: "",
    paymentLinkId: "",
    amountCents: 0,
    flow: "",
  };
}

export async function deactivatePaymentLink(
  stripe: Stripe,
  paymentLinkId: string,
): Promise<void> {
  const plId = paymentLinkId.trim();
  if (!plId.startsWith("pl_")) return;

  try {
    await stripe.paymentLinks.update(plId, { active: false });
  } catch (err) {
    console.error("[stripe] deactivate payment link", plId, err);
  }
}
