import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { isServiceRoleRequest } from '../_shared/edge-auth.ts';
import {
  getGoogleAccessToken,
  listCalendarEventsInRange,
  parseServiceAccountJson,
  type CalendarListEvent,
} from '../_shared/google-calendar.ts';

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

function eventBounds(event: CalendarListEvent): { startAt: string; endAt: string } | null {
  const startRaw = event.start?.dateTime ?? event.start?.date;
  const endRaw = event.end?.dateTime ?? event.end?.date;
  if (!startRaw || !endRaw) return null;

  const startAt = event.start?.date
    ? new Date(`${startRaw}T00:00:00.000Z`).toISOString()
    : new Date(startRaw).toISOString();
  const endAt = event.end?.date
    ? new Date(`${endRaw}T00:00:00.000Z`).toISOString()
    : new Date(endRaw).toISOString();

  if (endAt <= startAt) return null;
  return { startAt, endAt };
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

  let body: { room_id?: string; external_calendar_id?: string };
  try {
    body = (await req.json()) as { room_id?: string; external_calendar_id?: string };
  } catch {
    return json({ success: false, message: 'Body JSON non valido' }, 400);
  }

  const roomId = body.room_id?.trim();
  if (!roomId) {
    return json({ success: false, message: 'room_id obbligatorio' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const service = createClient(supabaseUrl, serviceKey);

  let query = service
    .from('room_external_calendars')
    .select('id, room_id, name, google_calendar_id, enabled')
    .eq('room_id', roomId)
    .eq('enabled', true);

  const calendarFilter = body.external_calendar_id?.trim();
  if (calendarFilter) {
    query = query.eq('id', calendarFilter);
  }

  const { data: calendars, error: calendarsError } = await query;

  if (calendarsError) {
    return json({ success: false, message: calendarsError.message }, 500);
  }

  if (!calendars?.length) {
    return json({
      success: true,
      synced: 0,
      message: 'Nessun calendario esterno attivo da sincronizzare.',
    });
  }

  const sa = parseServiceAccountJson(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '');
  if (!sa) {
    return json({
      success: false,
      message: 'GOOGLE_SERVICE_ACCOUNT_JSON non configurato',
    }, 502);
  }

  const actAs = Deno.env.get('GOOGLE_CALENDAR_ACT_AS_EMAIL')?.trim() || null;
  const token = await getGoogleAccessToken(sa, actAs);

  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  let syncedCount = 0;
  const errors: string[] = [];

  for (const calendar of calendars) {
    try {
      const events = await listCalendarEventsInRange(
        token,
        calendar.google_calendar_id,
        timeMin,
        timeMax,
      );

      const seenIds = new Set<string>();
      const rows: Array<{
        external_calendar_id: string;
        external_event_id: string;
        start_at: string;
        end_at: string;
        summary: string | null;
      }> = [];

      for (const event of events) {
        if (!event.id) continue;
        const bounds = eventBounds(event);
        if (!bounds) continue;

        seenIds.add(event.id);
        rows.push({
          external_calendar_id: calendar.id,
          external_event_id: event.id,
          start_at: bounds.startAt,
          end_at: bounds.endAt,
          summary: event.summary?.trim() || null,
        });
      }

      const { data: existing, error: existingError } = await service
        .from('external_calendar_events')
        .select('id, external_event_id')
        .eq('external_calendar_id', calendar.id);

      if (existingError) {
        throw new Error(existingError.message);
      }

      const staleIds = (existing ?? [])
        .filter((row) => !seenIds.has(row.external_event_id))
        .map((row) => row.id);

      if (staleIds.length > 0) {
        const { error: deleteError } = await service
          .from('external_calendar_events')
          .delete()
          .in('id', staleIds);
        if (deleteError) throw new Error(deleteError.message);
      }

      if (rows.length > 0) {
        const { error: upsertError } = await service
          .from('external_calendar_events')
          .upsert(rows, { onConflict: 'external_calendar_id,external_event_id' });
        if (upsertError) throw new Error(upsertError.message);
      }

      await service.rpc('mark_external_calendar_sync', {
        p_calendar_id: calendar.id,
        p_error: null,
      });

      syncedCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${calendar.name}: ${message}`);
      await service.rpc('mark_external_calendar_sync', {
        p_calendar_id: calendar.id,
        p_error: message,
      });
    }
  }

  return json({
    success: errors.length === 0,
    synced: syncedCount,
    total: calendars.length,
    message:
      errors.length === 0
        ? `Sincronizzati ${syncedCount} calendari.`
        : errors.join(' · '),
    errors,
  }, errors.length > 0 && syncedCount === 0 ? 502 : 200);
});
