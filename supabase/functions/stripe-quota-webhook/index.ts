import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  deactivatePaymentLink,
  PAID_STRIPE_EVENT_TYPES,
  QUOTA_FLOWS,
  resolveQuotaFromEvent,
  stripeClient,
  verifyStripeEventWithSecret,
} from '../_shared/stripe-webhook.ts';

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

function quotaWebhookSecret(): string {
  return (
    Deno.env.get('STRIPE_QUOTA_WEBHOOK_SECRET') ??
    Deno.env.get('STRIPE_WEBHOOK_SECRET') ??
    ''
  );
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
    event = verifyStripeEventWithSecret(req, rawBody, quotaWebhookSecret());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[stripe-quota-webhook] signature', msg);
    return json({ success: false, message: msg }, 400);
  }

  if (!PAID_STRIPE_EVENT_TYPES.has(event.type)) {
    return json({ success: true, received: true, ignored: true, eventType: event.type });
  }

  const stripe = stripeClient();
  const {
    enrollmentId,
    quotaPaymentId,
    paymentIntentId,
    paymentLinkId,
    amountCents,
    flow,
  } = await resolveQuotaFromEvent(stripe, event);

  if (!QUOTA_FLOWS.has(flow)) {
    return json({
      success: true,
      received: true,
      ignored: true,
      eventType: event.type,
      flow: flow || null,
    });
  }

  if (flow === 'quota_associativa' && !enrollmentId) {
    console.error('[stripe-quota-webhook] enrollment id missing', event.type, event.id);
    return json({
      success: false,
      message: 'Metadata iscrizione mancante (mp_id_iscrizione).',
      eventType: event.type,
    });
  }

  if (flow === 'quota_multi_pay' && !quotaPaymentId) {
    console.error('[stripe-quota-webhook] quota payment id missing', event.type, event.id);
    return json({
      success: false,
      message: 'Metadata pagamento quota mancante (mp_quota_payment_id).',
      eventType: event.type,
    });
  }

  const service = serviceClient();
  const { data, error } = await service.rpc('apply_stripe_quota_payment', {
    p_stripe_event_id: event.id,
    p_stripe_event_type: event.type,
    p_payment_intent_id: paymentIntentId || null,
    p_payment_link_id: paymentLinkId || null,
    p_amount_cents: amountCents > 0 ? amountCents : null,
    p_flow: flow,
    p_enrollment_id: enrollmentId || null,
    p_quota_payment_id: quotaPaymentId || null,
  });

  if (error) {
    console.error('[stripe-quota-webhook] rpc', error.message);
    return json({ success: false, message: error.message }, 500);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.success !== true) {
    return json({
      success: false,
      message: String(result.message ?? 'Applicazione pagamento quota fallita'),
      flow,
      enrollment_id: enrollmentId || null,
      quota_payment_id: quotaPaymentId || null,
    });
  }

  if (paymentLinkId) {
    await deactivatePaymentLink(stripe, paymentLinkId);
  }

  return json({
    success: true,
    received: true,
    duplicate: result.duplicate === true,
    flow,
    enrollment_id: result.enrollment_id ?? enrollmentId ?? null,
    quota_payment_id: result.quota_payment_id ?? quotaPaymentId ?? null,
    member_id: result.member_id ?? null,
    eventType: event.type,
  });
});
