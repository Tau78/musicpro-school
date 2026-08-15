import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import {
  calendarEventsToBusyIntervals,
  type BusyInterval,
} from '../_shared/calendar-room-filter.ts';
import { isServiceRoleRequest } from '../_shared/edge-auth.ts';
import {
  getGoogleAccessToken,
  listCalendarEventsInRange,
  parseServiceAccountJson,
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

function romeDayBoundsIso(date: string): { timeMin: string; timeMax: string } {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day - 1, 22, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 22, 0, 0));
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function mergeBusyIntervals(...groups: BusyInterval[][]): BusyInterval[] {
  const merged: BusyInterval[] = [];
  for (const group of groups) {
    for (const interval of group) {
      const overlaps = merged.some(
        (existing) =>
          existing.start_at < interval.end_at &&
          existing.end_at > interval.start_at &&
          existing.calendar_event_id === interval.calendar_event_id,
      );
      if (!overlaps) merged.push(interval);
    }
  }
  return merged;
}

async function loadExternalBusyIntervals(
  service: ReturnType<typeof createClient>,
  roomId: string,
  timeMin: string,
  timeMax: string,
): Promise<BusyInterval[]> {
  const { data: calendars, error: calendarsError } = await service
    .from('room_external_calendars')
    .select('id')
    .eq('room_id', roomId)
    .eq('enabled', true);

  if (calendarsError) {
    throw new Error(calendarsError.message);
  }

  const calendarIds = (calendars ?? []).map((row) => row.id as string);
  if (calendarIds.length === 0) return [];

  const { data: events, error: eventsError } = await service
    .from('external_calendar_events')
    .select('external_event_id, start_at, end_at')
    .in('external_calendar_id', calendarIds)
    .lt('start_at', timeMax)
    .gt('end_at', timeMin)
    .order('start_at', { ascending: true });

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  return (events ?? []).map((event) => ({
    start_at: event.start_at as string,
    end_at: event.end_at as string,
    source: 'calendar' as const,
    calendar_event_id: `ext:${event.external_event_id as string}`,
  }));
}

async function loadCalendarId(service: ReturnType<typeof createClient>): Promise<string> {
  const envId = Deno.env.get('BOOKING_GOOGLE_CALENDAR_ID')?.trim();
  if (envId) return envId;

  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'booking_google_calendar_id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  const id = data?.value?.trim();
  if (!id) throw new Error('booking_google_calendar_id non configurato.');
  return id;
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

  let body: { room_id?: string; date?: string };
  try {
    body = (await req.json()) as { room_id?: string; date?: string };
  } catch {
    return json({ success: false, message: 'Body JSON non valido' }, 400);
  }

  const roomId = body.room_id?.trim();
  const date = body.date?.trim();
  if (!roomId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ success: false, message: 'room_id e date (YYYY-MM-DD) obbligatori' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const service = createClient(supabaseUrl, serviceKey);

  const { data: room, error: roomError } = await service
    .from('rooms')
    .select('id, name, google_calendar_color_id')
    .eq('id', roomId)
    .maybeSingle();

  if (roomError) {
    return json({ success: false, message: roomError.message }, 500);
  }
  if (!room) {
    return json({ success: false, message: 'Sala non trovata' }, 404);
  }

  const { timeMin, timeMax } = romeDayBoundsIso(date);

  const sa = parseServiceAccountJson(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '');
  if (!sa) {
    try {
      const externalBusy = await loadExternalBusyIntervals(service, roomId, timeMin, timeMax);
      return json({
        success: true,
        busy: externalBusy,
        warning: 'GOOGLE_SERVICE_ACCOUNT_JSON non configurato',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, message, busy: [] }, 502);
    }
  }

  try {
    const actAs = Deno.env.get('GOOGLE_CALENDAR_ACT_AS_EMAIL')?.trim() || null;
    const calendarId = await loadCalendarId(service);
    const token = await getGoogleAccessToken(sa, actAs);
    const events = await listCalendarEventsInRange(token, calendarId, timeMin, timeMax);
    const mainBusy = calendarEventsToBusyIntervals(events, {
      name: room.name,
      google_calendar_color_id: room.google_calendar_color_id,
    });
    const externalBusy = await loadExternalBusyIntervals(service, roomId, timeMin, timeMax);
    const busy = mergeBusyIntervals(mainBusy, externalBusy);

    return json({ success: true, busy, calendar_id: calendarId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[calendar-availability]', message);
    return json({ success: false, message, busy: [] }, 502);
  }
});
