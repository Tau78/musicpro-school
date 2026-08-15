import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { syncBookingToGoogleCalendar } from '../_shared/booking-calendar-sync.ts';
import { isServiceRoleRequest } from '../_shared/edge-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

function authorize(req: Request): boolean {
  return isServiceRoleRequest(req);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, message: 'Metodo non consentito' }, 405);
  }

  if (!authorize(req)) {
    return json({ success: false, message: 'Non autorizzato' }, 401);
  }

  let body: { booking_id?: string; action?: 'upsert' | 'delete' };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Body JSON non valido' }, 400);
  }

  const bookingId = body.booking_id?.trim();
  if (!bookingId) {
    return json({ success: false, message: 'booking_id mancante' }, 400);
  }

  const action = body.action === 'delete' ? 'delete' : 'upsert';

  try {
    const result = await syncBookingToGoogleCalendar(serviceClient(), bookingId, action);
    if (!result.success) {
      await serviceClient().rpc('mark_booking_calendar_sync', {
        p_booking_id: bookingId,
        p_google_event_id: null,
        p_error: result.message ?? 'Sync fallita',
      });
      return json({ ...result }, 500);
    }
    return json({ ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[booking-calendar-sync]', msg);
    try {
      await serviceClient().rpc('mark_booking_calendar_sync', {
        p_booking_id: bookingId,
        p_google_event_id: null,
        p_error: msg,
      });
    } catch {
      // ignore
    }
    return json({ success: false, message: msg, booking_id: bookingId }, 500);
  }
});
