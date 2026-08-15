import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviScheduleEntry, Room } from "./bookings";
import type { Database } from "./types/database";

type RoomsClient = SupabaseClient<Database>;

export type { Room, ProviScheduleEntry };

export interface RoomInput {
  name: string;
  hourlyRateEur: number;
  openHour: number;
  closeHour: number;
  slotGranularityMinutes: number;
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  googleCalendarColorId: string | null;
  isActive: boolean;
  proviDaSoloEnabled: boolean;
  proviDaSoloDiscountEur: number;
}

export interface RoomMutationResult {
  success: boolean;
  errorMessage?: string;
}

const ROOM_SELECT =
  "id, name, slug, description, capacity, is_active, sort_order, hourly_rate_eur, slot_granularity_minutes, default_duration_minutes, min_duration_minutes, max_duration_minutes, open_hour, close_hour, google_calendar_color_id, provi_da_solo_enabled, provi_da_solo_discount_eur";

const PROVI_SCHEDULE_COLUMNS =
  "id, room_id, day_of_week, start_minute, end_minute, enabled";

export function roomToInput(room: Room): RoomInput {
  return {
    name: room.name,
    hourlyRateEur: room.hourly_rate_eur,
    openHour: room.open_hour,
    closeHour: room.close_hour,
    slotGranularityMinutes: room.slot_granularity_minutes,
    defaultDurationMinutes: room.default_duration_minutes,
    minDurationMinutes: room.min_duration_minutes,
    maxDurationMinutes: room.max_duration_minutes,
    googleCalendarColorId: room.google_calendar_color_id ?? null,
    isActive: room.is_active,
    proviDaSoloEnabled: room.provi_da_solo_enabled,
    proviDaSoloDiscountEur: room.provi_da_solo_discount_eur,
  };
}

function mapRoomInput(input: RoomInput): Database["public"]["Tables"]["rooms"]["Update"] {
  return {
    name: input.name.trim(),
    hourly_rate_eur: input.hourlyRateEur,
    open_hour: input.openHour,
    close_hour: input.closeHour,
    slot_granularity_minutes: input.slotGranularityMinutes,
    default_duration_minutes: input.defaultDurationMinutes,
    min_duration_minutes: input.minDurationMinutes,
    max_duration_minutes: input.maxDurationMinutes,
    google_calendar_color_id: input.googleCalendarColorId,
    is_active: input.isActive,
    provi_da_solo_enabled: input.proviDaSoloEnabled,
    provi_da_solo_discount_eur: input.proviDaSoloDiscountEur,
  };
}

function validateRoomInput(input: RoomInput): string | null {
  if (!input.name.trim()) {
    return "Il nome della sala è obbligatorio.";
  }

  if (input.openHour >= input.closeHour) {
    return "L'orario di chiusura deve essere successivo all'apertura.";
  }

  if (input.minDurationMinutes > input.maxDurationMinutes) {
    return "La durata minima non può superare la durata massima.";
  }

  return null;
}

/** All rooms for admin (includes inactive). */
export async function listAllRooms(client: RoomsClient): Promise<Room[]> {
  const { data, error } = await client
    .from("rooms")
    .select(ROOM_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare le sale: ${error.message}`);
  }

  return (data ?? []) as Room[];
}

export async function getAdminRoomById(
  client: RoomsClient,
  roomId: string,
): Promise<Room | null> {
  const { data, error } = await client
    .from("rooms")
    .select(ROOM_SELECT)
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare la sala: ${error.message}`);
  }

  return (data as Room | null) ?? null;
}

export async function updateRoom(
  client: RoomsClient,
  roomId: string,
  input: RoomInput,
): Promise<RoomMutationResult> {
  const validationError = validateRoomInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { error } = await client
    .from("rooms")
    .update(mapRoomInput(input))
    .eq("id", roomId);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare la sala.",
    };
  }

  return { success: true };
}

export async function listProviSchedule(
  client: RoomsClient,
  roomId: string,
): Promise<ProviScheduleEntry[]> {
  const { data, error } = await client
    .from("room_provi_da_solo_schedule")
    .select(PROVI_SCHEDULE_COLUMNS)
    .eq("room_id", roomId)
    .order("day_of_week", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare la griglia PROVI DA SOLO: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    roomId: row.room_id,
    dayOfWeek: row.day_of_week,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    enabled: row.enabled,
  }));
}

export async function saveProviSchedule(
  client: RoomsClient,
  roomId: string,
  entries: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    enabled: boolean;
  }>,
): Promise<void> {
  const { error: deleteError } = await client
    .from("room_provi_da_solo_schedule")
    .delete()
    .eq("room_id", roomId);

  if (deleteError) {
    throw new Error(
      `Impossibile aggiornare la griglia PROVI DA SOLO: ${deleteError.message}`,
    );
  }

  if (entries.length === 0) {
    return;
  }

  const rows = entries.map((entry) => ({
    room_id: roomId,
    day_of_week: entry.dayOfWeek,
    start_minute: entry.startMinute,
    end_minute: entry.endMinute,
    enabled: entry.enabled,
  }));

  const { error: insertError } = await client
    .from("room_provi_da_solo_schedule")
    .insert(rows);

  if (insertError) {
    throw new Error(
      `Impossibile salvare la griglia PROVI DA SOLO: ${insertError.message}`,
    );
  }
}
