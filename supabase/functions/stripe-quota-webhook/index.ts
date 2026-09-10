import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  deactivatePaymentLink,
  PAID_STRIPE_EVENT_TYPES,
  QUOTA_ASSOCIATIVA_FLOW,
  QUOTA_FLOWS,
  resolveQuotaFromEvent,
  stripeClient,
  verifyStripeEventWithSecret,
} from '../_shared/stripe-webhook.ts';
import { edgeUrlEnvFromDeno, internalAppUrl } from '../_shared/public-url.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
};

/** Fallback produzione se ISCRIZIONE_COMPLETA_URL / APP_URL non sono settati. */
const DEFAULT_ISCRIZIONE_COMPLETA_URL =
  'https://school.musicproeventi.it/api/iscrizione';

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

function iscrizioneInternalSecret(): string {
  return (
    Deno.env.get('ISCRIZIONE_INTERNAL_SECRET')?.trim() ||
    Deno.env.get('CRON_SECRET')?.trim() ||
    ''
  );
}

/**
 * URL Next per completaInvioIscrizione.
 * Preferisce ISCRIZIONE_COMPLETA_URL (path completo), altrimenti
 * `${internalAppUrl}/api/iscrizione`, altrimenti produzione.
 */
function completaInvioUrl(): string {
  const dedicated = Deno.env.get('ISCRIZIONE_COMPLETA_URL')?.trim();
  if (dedicated) return dedicated.replace(/\/$/, '');
  const origin = internalAppUrl(edgeUrlEnvFromDeno()).replace(/\/$/, '');
  if (origin) return `${origin}/api/iscrizione`;
  return DEFAULT_ISCRIZIONE_COMPLETA_URL;
}

/**
 * Dopo PAGATO su quota_associativa: avvia completaInvioIscrizione su Next
 * senza dipendere dal poll browser. Fire-and-forget — non blocca/fallisce Stripe.
 * Ritorna true se lo schedule è partito (anche se la fetch fallirà dopo).
 */
function triggerCompletaInvioIscrizione(enrollmentId: string): boolean {
  const id = enrollmentId.trim();
  if (!id) return false;

  const secret = iscrizioneInternalSecret();
  if (!secret) {
    console.error(
      '[stripe-quota-webhook] completaInvio skip: secret assente (ISCRIZIONE_INTERNAL_SECRET/CRON_SECRET); poll resta fallback',
    );
    return false;
  }

  const url = completaInvioUrl();
  const run = async () => {
    const controller = new AbortController();
    // Timeout breve: se Next è lento non teniamo Stripe in attesa.
    // waitUntil tiene viva la Promise oltre la response HTTP a Stripe.
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        'x-iscrizione-internal-secret': secret,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'completaInvioIscrizione',
          idIscrizione: id,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(
          '[stripe-quota-webhook] completaInvio HTTP',
          res.status,
          await res.text(),
        );
      }
    } catch (err) {
      console.error(
        '[stripe-quota-webhook] completaInvio',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const pending = run();
  try {
    EdgeRuntime.waitUntil(pending);
  } catch {
    void pending;
  }
  return true;
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
    const message = String(result.message ?? 'Applicazione pagamento quota fallita');
    // quota_associativa writes member_annual_quotas — enrollment.member_id must
    // already exist (create/link member at iscrizione submit). Do not invent a
    // member here from form_payload; multi-pay is unaffected (uses item.member_id).
    const memberRequired =
      flow === 'quota_associativa' &&
      /senza associato collegato/i.test(message);
    if (memberRequired) {
      console.error(
        '[stripe-quota-webhook] ENROLLMENT_MEMBER_REQUIRED: create member at submit before Payment Link',
        { enrollmentId, eventId: event.id },
      );
      return json({
        success: false,
        error_code: 'ENROLLMENT_MEMBER_REQUIRED',
        message:
          "Iscrizione senza member_id: creare l'associato al submit (prima del Payment Link). Non risolvibile dal webhook.",
        flow,
        enrollment_id: enrollmentId || null,
        quota_payment_id: null,
      });
    }
    return json({
      success: false,
      message,
      flow,
      enrollment_id: enrollmentId || null,
      quota_payment_id: quotaPaymentId || null,
    });
  }

  if (paymentLinkId) {
    await deactivatePaymentLink(stripe, paymentLinkId);
  }

  let completaInvioTriggered = false;
  const appliedEnrollmentId = String(
    result.enrollment_id ?? enrollmentId ?? '',
  ).trim();
  if (flow === QUOTA_ASSOCIATIVA_FLOW && appliedEnrollmentId) {
    // Anche su duplicate: completaInvio è idempotente (alreadySent / claim).
    completaInvioTriggered = triggerCompletaInvioIscrizione(appliedEnrollmentId);
  }

  return json({
    success: true,
    received: true,
    duplicate: result.duplicate === true,
    flow,
    enrollment_id: result.enrollment_id ?? enrollmentId ?? null,
    quota_payment_id: result.quota_payment_id ?? quotaPaymentId ?? null,
    member_id: result.member_id ?? null,
    completa_invio_triggered: completaInvioTriggered,
    eventType: event.type,
  });
});
