import type { CalendarListEvent } from './google-calendar.ts';

export type RoomCalendarFilter = {
  name: string;
  google_calendar_color_id?: string | null;
};

export type BusyInterval = {
  start_at: string;
  end_at: string;
  source: 'calendar';
  calendar_event_id: string;
};

function summaryMatchesRoom(summary: string | undefined, roomName: string): boolean {
  const normalized = (summary ?? '').trim().toUpperCase();
  const room = roomName.trim().toUpperCase();
  if (!normalized || !room) return false;
  return normalized.startsWith(`${room} -`) || normalized.startsWith(`${room}-`);
}

function parseEventInterval(event: CalendarListEvent): BusyInterval | null {
  const eventId = event.id?.trim();
  if (!eventId) return null;

  if (event.start?.dateTime && event.end?.dateTime) {
    return {
      start_at: event.start.dateTime,
      end_at: event.end.dateTime,
      source: 'calendar',
      calendar_event_id: eventId,
    };
  }

  if (event.start?.date) {
    const startDate = event.start.date;
    const endDate = event.end?.date ?? startDate;
    return {
      start_at: `${startDate}T00:00:00+02:00`,
      end_at: `${endDate}T00:00:00+02:00`,
      source: 'calendar',
      calendar_event_id: eventId,
    };
  }

  return null;
}

export function eventAppliesToRoom(
  event: CalendarListEvent,
  room: RoomCalendarFilter,
): boolean {
  if (event.status === 'cancelled') return false;

  const colorId = room.google_calendar_color_id?.trim();
  if (colorId && event.colorId === colorId) return true;

  return summaryMatchesRoom(event.summary, room.name);
}

export function calendarEventsToBusyIntervals(
  events: CalendarListEvent[],
  room: RoomCalendarFilter,
): BusyInterval[] {
  const intervals: BusyInterval[] = [];

  for (const event of events) {
    if (!eventAppliesToRoom(event, room)) continue;
    const interval = parseEventInterval(event);
    if (interval) intervals.push(interval);
  }

  return intervals;
}
