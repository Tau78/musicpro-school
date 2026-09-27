import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  formParamsFromRequest,
  loadNexiXpayConfig,
  verifyPaymentResponseMac,
} from '../_shared/nexi-xpay.ts';
import { syncBookingToGoogleCalendar } from '../_shared/booking-calendar-sync.ts';
import { processBookingEmail } from '../_shared/booking-email.ts';
import { edgeUrlEnvFromDeno, internalAppUrl } from '../_shared/public-url.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_ISCRIZIONE_COMPLETA_URL =
  'https://school.musicproeventi.it/api/iscrizione';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key);
}

function ackOk(extra = ''): Response {
  return new Response(`OK${extra ? ` ${extra}` : ''}`, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function iscrizioneInternalSecret(): string {
  return (
    Deno.env.get('ISCRIZIONE_INTERNAL_SECRET')?.trim() ||
    Deno.env.get('CRON_SECRET')?.trim() ||
    ''
  );
}

function completaInvioUrl(): string {
  const dedicated = Deno.env.get('ISCRIZIONE_COMPLETA_URL')?.trim();
  if (dedicated) return dedicated.replace(/\/$/, '');
  const origin = internalAppUrl(edgeUrlEnvFromDeno()).replace(/\/$/, '');
  if (origin) return `${origin}/api/iscrizione`;
  return DEFAULT_ISCRIZIONE_COMPLETA_URL;
}

function triggerCompletaInvioIscrizione(enrollmentId: string): boolean {
  const id = enrollmentId.trim();
  if (!id) return false;
  const secret = iscrizioneInternalSecret();
  if (!secret) {
    console.error('[nexi-xpay-notify] completaInvio skip: secret assente');
    return false;
  }
  const url = completaInvioUrl();
  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
          'x-iscrizione-internal-secret': secret,
        },
        body: JSON.stringify({
          action: 'completaInvioIscrizione',
          idIscrizione: id,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error('[nexi-xpay-notify] completaInvio HTTP', res.status, await res.text());
      }
    } catch (err) {
      console.error(
        '[nexi-xpay-notify] completaInvio',
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

async function afterRoomPaid(
  service: ReturnType<typeof serviceClient>,
  bookingId: string,
): Promise<void> {
  try {
    const cal = await syncBookingToGoogleCalendar(service, bookingId, 'upsert');
    if (!cal.success && cal.action !== 'skip') {
      console.error('[nexi-xpay-notify] calendar', cal.message);
      await service.rpc('mark_booking_calendar_sync', {
        p_booking_id: bookingId,
        p_google_event_id: null,
        p_error: cal.message ?? 'Sync calendario fallito',
      });
    }
  } catch (calErr) {
    const msg = calErr instanceof Error ? calErr.message : String(calErr);
    console.error('[nexi-xpay-notify] calendar', msg);
    await service.rpc('mark_booking_calendar_sync', {
      p_booking_id: bookingId,
      p_google_event_id: null,
      p_error: msg,
    });
  }

  try {
    const emailResult = await processBookingEmail(service, bookingId, 'confirm');
    if (emailResult.success !== true) {
      console.error('[nexi-xpay-notify] email', emailResult.message);
    }
  } catch (emailErr) {
    const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
    console.error('[nexi-xpay-notify] email', msg);
  }
}

function triggerLessonPackReceipt(paymentId: string): void {
  const id = paymentId.trim();
  if (!id) return;
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  if (!cronSecret) {
    console.error('[nexi-xpay-notify] ricevuta saltata: manca CRON_SECRET');
    return;
  }
  const appUrl = internalAppUrl(edgeUrlEnvFromDeno());
  const run = async () => {
    try {
      const emitRes = await fetch(`${appUrl}/api/lezioni/receipts/from-payment`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cronSecret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ paymentId: id }),
      });
      if (!emitRes.ok) {
        console.error(
          '[nexi-xpay-notify] receipt emit HTTP',
          emitRes.status,
          await emitRes.text(),
        );
      }
    } catch (emitError) {
      console.error(
        '[nexi-xpay-notify] receipt emit',
        emitError instanceof Error ? emitError.message : String(emitError),
      );
    }
  };
  const pending = run();
  try {
    EdgeRuntime.waitUntil(pending);
  } catch {
    void pending;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Metodo non consentito', { status: 405, headers: corsHeaders });
  }

  const config = loadNexiXpayConfig();
  if (!config) {
    console.error('[nexi-xpay-notify] secrets missing');
    return new Response('config', { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const params = formParamsFromRequest(rawBody);

  const codTrans = String(params.codTrans ?? '').trim();
  const esito = String(params.esito ?? '').trim().toUpperCase();
  const importo = String(params.importo ?? '').trim();
  const divisa = String(params.divisa ?? '').trim();
  const data = String(params.data ?? '').trim();
  const orario = String(params.orario ?? '').trim();
  const codAut = String(params.codAut ?? '').trim();
  const mac = String(params.mac ?? '').trim();

  if (!codTrans || !esito || !mac) {
    console.error('[nexi-xpay-notify] missing fields', { codTrans, esito, hasMac: Boolean(mac) });
    return new Response('bad request', { status: 400, headers: corsHeaders });
  }

  const macOk = await verifyPaymentResponseMac(config.macKey, {
    codTrans,
    esito,
    importo,
    divisa,
    data,
    orario,
    codAut,
    mac,
  });
  if (!macOk) {
    console.error('[nexi-xpay-notify] bad mac', codTrans);
    return new Response('mac', { status: 400, headers: corsHeaders });
  }

  if (esito !== 'OK') {
    console.log('[nexi-xpay-notify] non-OK esito', esito, codTrans);
    return ackOk('ignored');
  }

  const service = serviceClient();
  const amountCents = Number.parseInt(importo, 10);
  const { data: rpcData, error } = await service.rpc('apply_nexi_payment', {
    p_cod_trans: codTrans,
    p_cod_aut: codAut || null,
    p_esito: esito,
    p_amount_cents: Number.isFinite(amountCents) && amountCents > 0 ? amountCents : null,
  });

  if (error) {
    console.error('[nexi-xpay-notify] rpc', error.message);
    return new Response('error', { status: 500, headers: corsHeaders });
  }

  const result = (rpcData ?? {}) as Record<string, unknown>;
  if (result.success !== true) {
    console.error('[nexi-xpay-notify] apply failed', result.message);
    return new Response('apply', { status: 500, headers: corsHeaders });
  }

  const duplicate = result.duplicate === true;
  const flow = String(result.flow ?? '');

  if (flow === 'quota_associativa') {
    const enrollmentId = String(result.enrollment_id ?? '').trim();
    if (enrollmentId) triggerCompletaInvioIscrizione(enrollmentId);
  }

  if (flow === 'room_booking' && !duplicate) {
    const bookingId = String(result.booking_id ?? '').trim();
    if (bookingId) {
      try {
        EdgeRuntime.waitUntil(afterRoomPaid(service, bookingId));
      } catch {
        void afterRoomPaid(service, bookingId);
      }
    }
  }

  if (flow === 'lesson_pack' && !duplicate) {
    const paymentId = String(result.lesson_pack_payment_id ?? '').trim();
    if (paymentId) triggerLessonPackReceipt(paymentId);
  }

  return ackOk(duplicate ? 'duplicate' : 'paid');
});
