// Deprecated: use Supabase Edge `stripe-room-webhook` instead.
// Vercel monorepo Lambda cannot load next-server runtime (500). See docs/STRIPE_ROOM_WEBHOOK.md.

import { NextRequest, NextResponse } from "next/server";

import { getStripeConfig } from "@/lib/iscrizione/stripe-config";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  PAID_STRIPE_EVENT_TYPES,
  createStripeClient,
  deactivatePaymentLink,
  resolveRoomBookingFromEvent,
  verifyStripeWebhookEvent,
} from "@/lib/stripe/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = verifyStripeWebhookEvent(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] signature", message);
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  if (!PAID_STRIPE_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({
      success: true,
      received: true,
      ignored: true,
      eventType: event.type,
    });
  }

  const cfg = getStripeConfig();
  const stripe = createStripeClient(cfg.secret);
  const { bookingRef, paymentIntentId, paymentLinkId, amountCents, flow } =
    await resolveRoomBookingFromEvent(stripe, event);

  if (flow !== "room_booking") {
    return NextResponse.json({
      success: true,
      received: true,
      ignored: true,
      eventType: event.type,
      flow: flow || null,
    });
  }

  if (!bookingRef) {
    console.error("[stripe/webhook] booking ref missing", event.type, event.id);
    return NextResponse.json(
      {
        success: false,
        message: "Metadata prenotazione mancante (mp_id_prenotazione).",
        eventType: event.type,
      },
      { status: 200 },
    );
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("apply_stripe_room_booking_payment", {
    p_booking_ref: bookingRef,
    p_stripe_event_id: event.id,
    p_stripe_event_type: event.type,
    p_payment_intent_id: paymentIntentId || null,
    p_payment_link_id: paymentLinkId || null,
    p_amount_cents: amountCents > 0 ? amountCents : null,
  });

  if (error) {
    console.error("[stripe/webhook] rpc", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.success !== true) {
    return NextResponse.json(
      {
        success: false,
        message: String(result.message ?? "Applicazione pagamento fallita"),
        booking_ref: bookingRef,
      },
      { status: 200 },
    );
  }

  if (paymentLinkId) {
    await deactivatePaymentLink(stripe, paymentLinkId);
  }

  return NextResponse.json({
    success: true,
    received: true,
    duplicate: result.duplicate === true,
    booking_id: result.booking_id ?? null,
    eventType: event.type,
  });
}
