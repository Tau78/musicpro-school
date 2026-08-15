import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  CREDIT_SHOP_FLOW,
  deactivatePaymentLink,
  PAID_STRIPE_EVENT_TYPES,
  resolveCreditShopFromEvent,
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

function creditShopWebhookSecret(): string {
  return (
    Deno.env.get('STRIPE_CREDIT_SHOP_WEBHOOK_SECRET') ??
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
    event = verifyStripeEventWithSecret(req, rawBody, creditShopWebhookSecret());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[stripe-credit-shop-webhook] signature', msg);
    return json({ success: false, message: msg }, 400);
  }

  if (!PAID_STRIPE_EVENT_TYPES.has(event.type)) {
    return json({ success: true, received: true, ignored: true, eventType: event.type });
  }

  const stripe = stripeClient();
  const { memberId, packageId, paymentIntentId, paymentLinkId, amountCents, flow } =
    await resolveCreditShopFromEvent(stripe, event);

  if (flow !== CREDIT_SHOP_FLOW) {
    return json({
      success: true,
      received: true,
      ignored: true,
      eventType: event.type,
      flow: flow || null,
    });
  }

  if (!memberId) {
    console.error('[stripe-credit-shop-webhook] member id missing', event.type, event.id);
    return json({
      success: false,
      message: 'Metadata associato mancante (mp_member_id).',
      eventType: event.type,
    });
  }

  if (!packageId) {
    console.error('[stripe-credit-shop-webhook] package id missing', event.type, event.id);
    return json({
      success: false,
      message: 'Metadata pacchetto mancante (mp_package_id).',
      eventType: event.type,
    });
  }

  const service = serviceClient();
  const { data, error } = await service.rpc('apply_stripe_credit_shop_payment', {
    p_member_ref: memberId,
    p_package_id: packageId,
    p_stripe_event_id: event.id,
    p_stripe_event_type: event.type,
    p_payment_intent_id: paymentIntentId || null,
    p_payment_link_id: paymentLinkId || null,
    p_amount_cents: amountCents > 0 ? amountCents : null,
  });

  if (error) {
    console.error('[stripe-credit-shop-webhook] rpc', error.message);
    return json({ success: false, message: error.message }, 500);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.success !== true) {
    return json({
      success: false,
      message: String(result.message ?? 'Applicazione pagamento SHOP fallita'),
      member_id: memberId,
      package_id: packageId,
    });
  }

  if (paymentLinkId) {
    await deactivatePaymentLink(stripe, paymentLinkId);
  }

  return json({
    success: true,
    received: true,
    duplicate: result.duplicate === true,
    purchase_id: result.purchase_id ?? null,
    member_id: result.member_id ?? memberId,
    eventType: event.type,
  });
});
