import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Richiede POST /api/admin/external-calendars/sync (solo web). */
export async function requestExternalCalendarSync(params: {
  roomId: string;
  calendarId?: string;
}): Promise<{ success: boolean; message?: string }> {
  const resp = await fetch("/api/admin/external-calendars/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId: params.roomId,
      calendarId: params.calendarId,
    }),
    credentials: "same-origin",
  });

  const data = (await resp.json()) as {
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
}
