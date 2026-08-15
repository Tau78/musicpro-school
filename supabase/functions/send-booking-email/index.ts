import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import {
  type BookingEmailTemplate,
  processBookingEmail,
} from '../_shared/booking-email.ts';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, message: 'Metodo non consentito' }, 405);
  }

  if (!isServiceRoleRequest(req)) {
    return json({ success: false, message: 'Non autorizzato' }, 401);
  }

  let body: {
    booking_id?: string;
    template?: string;
    force?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Body JSON non valido' }, 400);
  }

  const bookingId = body.booking_id?.trim();
  if (!bookingId) {
    return json({ success: false, message: 'booking_id mancante' }, 400);
  }

  const templateRaw = body.template?.trim();
  const template: BookingEmailTemplate =
    templateRaw === 'modified' ? 'modified' : 'confirm';
  const force = body.force === true;

  try {
    const result = await processBookingEmail(
      serviceClient(),
      bookingId,
      template,
      force,
    );
    const status = result.success === false ? 500 : 200;
    return json(result, status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-booking-email]', msg);
    return json({ success: false, message: msg, booking_id: bookingId }, 500);
  }
});
