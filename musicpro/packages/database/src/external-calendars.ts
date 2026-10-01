import type { SupabaseClient } from "@supabase/supabase-js";

import { getRomeDayBoundsUtc } from "./bookings";
import { matchRoomFromEventSummary } from "./google-calendar-colors";
import type { Database } from "./types/database";

type ExternalCalendarsClient = SupabaseClient<Database>;

export interface RoomExternalCalendar {
  id: string;
  roomId: string;
  name: string;
  googleCalendarId: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomExternalCalendarInput {
  name: string;
  googleCalendarId: string;
  enabled: boolean;
}

export interface ExternalCalendarMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

type ExternalCalendarRow = {
  id: string;
  room_id: string;
  name: string;
  google_calendar_id: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

const EXTERNAL_CALENDAR_COLUMNS =
  "id, room_id, name, google_calendar_id, enabled, last_synced_at, last_sync_error, created_at, updated_at";

function mapExternalCalendar(row: ExternalCalendarRow): RoomExternalCalendar {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    googleCalendarId: row.google_calendar_id,
    enabled: row.enabled,
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExternalCalendarInput(input: RoomExternalCalendarInput) {
  return {
    name: input.name.trim(),
    google_calendar_id: input.googleCalendarId.trim(),
    enabled: input.enabled,
  };
}

function validateExternalCalendarInput(
  input: RoomExternalCalendarInput,
): string | null {
  if (!input.name.trim()) {
    return "Il nome del calendario è obbligatorio.";
  }
  if (!input.googleCalendarId.trim()) {
    return "L'ID Google Calendar è obbligatorio.";
  }
  return null;
}

export async function listRoomExternalCalendars(
  client: ExternalCalendarsClient,
  roomId: string,
): Promise<RoomExternalCalendar[]> {
  const { data, error } = await client
    .from("room_external_calendars")
    .select(EXTERNAL_CALENDAR_COLUMNS)
    .eq("room_id", roomId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare i calendari esterni: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    mapExternalCalendar(row as ExternalCalendarRow),
  );
}

export async function createRoomExternalCalendar(
  client: ExternalCalendarsClient,
  roomId: string,
  input: RoomExternalCalendarInput,
): Promise<ExternalCalendarMutationResult> {
  const validationError = validateExternalCalendarInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { data, error } = await client
    .from("room_external_calendars")
    .insert({ room_id: roomId, ...mapExternalCalendarInput(input) })
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare il calendario.",
    };
  }

  return { success: true, id: data.id };
}

export async function updateRoomExternalCalendar(
  client: ExternalCalendarsClient,
  calendarId: string,
  input: RoomExternalCalendarInput,
): Promise<ExternalCalendarMutationResult> {
  const validationError = validateExternalCalendarInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { error } = await client
    .from("room_external_calendars")
    .update(mapExternalCalendarInput(input))
    .eq("id", calendarId);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare il calendario.",
    };
  }

  return { success: true, id: calendarId };
}

export async function deleteRoomExternalCalendar(
  client: ExternalCalendarsClient,
  calendarId: string,
): Promise<ExternalCalendarMutationResult> {
  const { error } = await client
    .from("room_external_calendars")
    .delete()
    .eq("id", calendarId);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare il calendario.",
    };
  }

  return { success: true };
}

export type ExternalCalendarEvent = {
  id: string;
  roomId: string;
  roomName: string | null;
  calendarName: string;
  summary: string | null;
  startsAt: string;
  endsAt: string;
  calendarColorId: string | null;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveRangeBound(value: string, label: string): string {
  const trimmed = value.trim();
  if (ISO_DATE_RE.test(trimmed)) {
    return getRomeDayBoundsUtc(trimmed).startUtc;
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw new Error(`${label} non è valida.`);
  }
  return new Date(ms).toISOString();
}

export async function listExternalCalendarEventsInRange(
  client: ExternalCalendarsClient,
  input: { from: string; to: string; roomId?: string },
): Promise<ExternalCalendarEvent[]> {
  const from = resolveRangeBound(input.from, "La data di inizio");
  const to = resolveRangeBound(input.to, "La data di fine");
  if (from >= to) return [];

  let calendarsQuery = client
    .from("room_external_calendars")
    .select("id, room_id, name, enabled")
    .eq("enabled", true);
  if (input.roomId) {
    calendarsQuery = calendarsQuery.eq("room_id", input.roomId);
  }

  const { data: calendars, error: calendarsError } = await calendarsQuery;
  if (calendarsError) {
    throw new Error(
      `Impossibile caricare i calendari esterni: ${calendarsError.message}`,
    );
  }
  if (!calendars?.length) return [];

  const calendarIds = calendars.map((row) => row.id);
  const { data: events, error: eventsError } = await client
    .from("external_calendar_events")
    .select("id, external_calendar_id, start_at, end_at, summary")
    .in("external_calendar_id", calendarIds)
    .lt("start_at", to)
    .gt("end_at", from)
    .order("start_at", { ascending: true });

  if (eventsError) {
    throw new Error(
      `Impossibile caricare gli eventi esterni: ${eventsError.message}`,
    );
  }
  if (!events?.length) return [];

  const { data: rooms } = await client
    .from("rooms")
    .select("id, name, google_calendar_color_id");
  const roomById = new Map(
    (rooms ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        googleCalendarColorId: row.google_calendar_color_id ?? null,
      },
    ]),
  );
  const roomMatches = [...roomById.values()];
  const calendarById = new Map(calendars.map((row) => [row.id, row]));

  return events.flatMap((event) => {
    const calendar = calendarById.get(event.external_calendar_id);
    if (!calendar) return [];
    const host = roomById.get(calendar.room_id) ?? null;
    const matched = matchRoomFromEventSummary(event.summary, roomMatches);
    const room = matched ?? host;
    return [
      {
        id: event.id,
        roomId: room?.id ?? calendar.room_id,
        roomName: room?.name ?? null,
        calendarName: calendar.name,
        summary: event.summary,
        startsAt: event.start_at,
        endsAt: event.end_at,
        calendarColorId: room?.googleCalendarColorId ?? null,
      },
    ];
  });
}

/** Richiede POST /api/admin/external-calendars/sync (solo web). */
export async function requestExternalCalendarSync(params: {
  roomId: string;
  calendarId?: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const resp = await fetch("/api/admin/external-calendars/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: params.roomId,
        calendarId: params.calendarId,
      }),
      credentials: "same-origin",
    });

    const data = (await resp.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
    };

    if (!resp.ok || !data.success) {
      return {
        success: false,
        message: data.message ?? "Sincronizzazione non riuscita.",
      };
    }

    return { success: true, message: data.message };
  } catch {
    return { success: false, message: "Sincronizzazione non riuscita." };
  }
}
