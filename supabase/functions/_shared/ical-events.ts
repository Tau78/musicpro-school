import type { CalendarListEvent } from './google-calendar.ts';

function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function icsLineValue(block: string, key: string): string | null {
  const re = new RegExp(`^${key}[;:]([^\\n]+)$`, 'mi');
  const match = block.match(re);
  if (!match?.[1]) return null;
  return match[1].replace(/\\n/g, '\n').replace(/\\,/g, ',').trim();
}

function icsDateParam(block: string, key: string): string | null {
  const re = new RegExp(`^${key}([^:\\n]*):([^\\n]+)$`, 'mi');
  const match = block.match(re);
  return match?.[2]?.trim() ?? null;
}

function parseIcsDateTime(raw: string, utc: boolean): Date | null {
  const m = raw
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4] ?? '0');
  const minute = Number(m[5] ?? '0');
  const second = Number(m[6] ?? '0');
  if (utc || m[7] === 'Z' || !m[4]) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }
  const dst = month > 3 && month < 10;
  const offset = dst ? '+02:00' : '+01:00';
  const iso = `${m[1]}-${m[2]}-${m[3]}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${offset}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toListEvent(
  uid: string,
  start: Date,
  end: Date,
  summary: string | null,
): CalendarListEvent {
  return {
    id: uid,
    summary: summary ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

export function parseIcsEvents(
  ics: string,
  timeMinIso: string,
  timeMaxIso: string,
): CalendarListEvent[] {
  const min = new Date(timeMinIso).getTime();
  const max = new Date(timeMaxIso).getTime();
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  const events: CalendarListEvent[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split('END:VEVENT')[0] ?? '';
    const uid = icsLineValue(block, 'UID');
    const startRaw = icsDateParam(block, 'DTSTART');
    const endRaw = icsDateParam(block, 'DTEND');
    if (!uid || !startRaw) continue;

    const startUtc = /Z$/i.test(startRaw) || startRaw.length === 8;
    const start = parseIcsDateTime(startRaw.replace(/Z$/i, startUtc ? 'Z' : ''), startUtc);
    if (!start) continue;

    let end: Date | null = null;
    if (endRaw) {
      const endUtc = /Z$/i.test(endRaw) || endRaw.length === 8;
      end = parseIcsDateTime(endRaw.replace(/Z$/i, endUtc ? 'Z' : ''), endUtc);
    }
    if (!end) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    if (end.getTime() <= start.getTime()) continue;
    if (end.getTime() <= min || start.getTime() >= max) continue;

    events.push(toListEvent(uid, start, end, icsLineValue(block, 'SUMMARY')));
  }

  return events;
}

export async function fetchPublicGoogleIcal(
  calendarId: string,
  icalUrl?: string | null,
): Promise<string> {
  const encoded = encodeURIComponent(calendarId);
  const urls = [
    icalUrl?.trim() || '',
    `https://calendar.google.com/calendar/ical/${encoded}/public/full.ics`,
    `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`,
  ].filter(Boolean);

  let lastError = 'Feed iCal non raggiungibile.';
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Accept: 'text/calendar, text/plain, */*' },
    });
    const text = await res.text();
    if (res.ok && text.includes('BEGIN:VCALENDAR')) {
      return text;
    }
    lastError =
      res.status === 404
        ? 'Calendario non pubblico (iCal 404). Condividilo con il service account o rendi pubblico il feed.'
        : `iCal ${res.status}`;
  }
  throw new Error(lastError);
}

export async function listPublicIcalEventsInRange(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  icalUrl?: string | null,
): Promise<CalendarListEvent[]> {
  const ics = await fetchPublicGoogleIcal(calendarId, icalUrl);
  return parseIcsEvents(ics, timeMin, timeMax);
}
