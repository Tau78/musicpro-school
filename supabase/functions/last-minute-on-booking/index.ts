import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { edgeUrlEnvFromDeno, internalAppUrl } from '../_shared/public-url.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lm-hook-secret',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hookSecret(): string {
  return (
    Deno.env.get('LM_HOOK_SECRET')?.trim() ||
    Deno.env.get('CRON_SECRET')?.trim() ||
    ''
  );
}

function internalSecret(): string {
  return (
    Deno.env.get('ISCRIZIONE_INTERNAL_SECRET')?.trim() ||
    Deno.env.get('CRON_SECRET')?.trim() ||
    ''
  );
}

function authorized(req: Request): boolean {
  const expected = hookSecret();
  if (!expected) return false;
  const header = req.headers.get('x-lm-hook-secret')?.trim();
  const auth = req.headers.get('authorization')?.trim();
  if (header && header === expected) return true;
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, message: 'Metodo non consentito' }, 405);
  }

  if (!authorized(req)) {
    return json({ success: false, message: 'Non autorizzato' }, 401);
  }

  let body: { booking_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Body JSON non valido' }, 400);
  }

  const bookingId = body.booking_id?.trim();
  if (!bookingId) {
    return json({ success: false, message: 'booking_id mancante' }, 400);
  }

  const appBase = internalAppUrl(edgeUrlEnvFromDeno()).replace(/\/$/, '');
  const secret = internalSecret();
  if (!appBase || !secret) {
    return json(
      {
        success: false,
        message: 'Config Vercel interna mancante (SCHOOL_PUBLIC_URL / CRON_SECRET)',
      },
      500,
    );
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) {
    return json({ success: false, message: 'Config Supabase mancante' }, 500);
  }

  const service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: booking, error: bookingError } = await service
    .from('bookings')
    .select('id, status, start_at, room_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) {
    return json({ success: false, message: bookingError.message }, 500);
  }
  if (!booking?.id) {
    return json({ success: false, message: 'Prenotazione non trovata' }, 404);
  }

  if (booking.status !== 'confirmed' && booking.status !== 'cancelled') {
    return json({ success: true, skipped: true, reason: 'status_not_actionable' });
  }

  try {
    const res = await fetch(`${appBase}/api/internal/last-minute/sync-day`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        'x-iscrizione-internal-secret': secret,
      },
      body: JSON.stringify({ booking_id: bookingId }),
    });

    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return json(
        {
          success: false,
          message: String(payload.message ?? `HTTP ${res.status}`),
        },
        res.status >= 500 ? 500 : 502,
      );
    }

    return json({ success: true, booking_id: bookingId, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ success: false, message }, 500);
  }
});