import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  deactivatePaymentLink,
  PAID_STRIPE_EVENT_TYPES,
  resolveRoomBookingFromEvent,
  ROOM_BOOKING_FLOW,
  stripeClient,
  verifyStripeEvent,
} from '../_shared/stripe-webhook.ts';
import { syncBookingToGoogleCalendar } from '../_shared/booking-calendar-sync.ts';
import { processBookingEmail } from '../_shared/booking-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, message: 'Metodo non consentito' }, 405);
  }

  const rawBody = await req.text();

  let event;
  try {
    event = verifyStripeEvent(req, rawBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[stripe-room-webhook] signature', msg);
    return json({ success: false, message: msg }, 400);
  }

  if (!PAID_STRIPE_EVENT_TYPES.has(event.type)) {
    return json({ success: true, received: true, ignored: true, eventType: event.type });
  }

  const stripe = stripeClient();
  const { bookingRef, paymentIntentId, paymentLinkId, amountCents, flow } =
    await resolveRoomBookingFromEvent(stripe, event);

  if (flow !== ROOM_BOOKING_FLOW) {
    return json({
      success: true,
      received: true,
      ignored: true,
      eventType: event.type,
      flow: flow || null,
    });
  }

  if (!bookingRef) {
    console.error('[stripe-room-webhook] booking ref missing', event.type, event.id);
    return json({
      success: false,
      message: 'Metadata prenotazione mancante (mp_id_prenotazione).',
      eventType: event.type,
    });
  }

  const service = serviceClient();
  const { data, error } = await service.rpc('apply_stripe_room_booking_payment', {
    p_booking_ref: bookingRef,
    p_stripe_event_id: event.id,
    p_stripe_event_type: event.type,
    p_payment_intent_id: paymentIntentId || null,
    p_payment_link_id: paymentLinkId || null,
    p_amount_cents: amountCents > 0 ? amountCents : null,
  });

  if (error) {
    console.error('[stripe-room-webhook] rpc', error.message);
    return json({ success: false, message: error.message }, 500);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.success !== true) {
    return json({
      success: false,
      message: String(result.message ?? 'Applicazione pagamento fallita'),
      booking_ref: bookingRef,
    });
  }

  if (paymentLinkId) {
    await deactivatePaymentLink(stripe, paymentLinkId);
  }

  const bookingId = result.booking_id as string | null;
  if (bookingId) {
    try {
      const cal = await syncBookingToGoogleCalendar(service, bookingId, 'upsert');
      if (!cal.success && cal.action !== 'skip') {
        console.error('[stripe-room-webhook] calendar', cal.message);
        await service.rpc('mark_booking_calendar_sync', {
          p_booking_id: bookingId,
          p_google_event_id: null,
          p_error: cal.message ?? 'Sync calendario fallito',
        });
      }
    } catch (calErr) {
      const msg = calErr instanceof Error ? calErr.message : String(calErr);
      console.error('[stripe-room-webhook] calendar', msg);
      await service.rpc('mark_booking_calendar_sync', {
        p_booking_id: bookingId,
        p_google_event_id: null,
        p_error: msg,
      });
    }

    try {
      const emailResult = await processBookingEmail(service, bookingId, 'confirm');
      if (emailResult.success !== true) {
        console.error('[stripe-room-webhook] email', emailResult.message);
      }
    } catch (emailErr) {
      const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error('[stripe-room-webhook] email', msg);
    }
  }

  return json({
    success: true,
    received: true,
    duplicate: result.duplicate === true,
    booking_id: result.booking_id ?? null,
    eventType: event.type,
  });
});
