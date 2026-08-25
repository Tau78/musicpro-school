import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviScheduleEntry, Room } from "./bookings";
import type { Database } from "./types/database";

type RoomsClient = SupabaseClient<Database>;

export type { Room, ProviScheduleEntry };

export interface RoomInput {
  name: string;
  hourlyRateEur: number;
  openMinute: number;
  closeMinute: number;
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
  "id, name, slug, description, capacity, is_active, sort_order, hourly_rate_eur, slot_granularity_minutes, default_duration_minutes, min_duration_minutes, max_duration_minutes, open_hour, close_hour, open_minute, close_minute, google_calendar_color_id, provi_da_solo_enabled, provi_da_solo_discount_eur";

const PROVI_SCHEDULE_COLUMNS =
  "id, room_id, day_of_week, start_minute, end_minute, enabled";

export function roomToInput(room: Room): RoomInput {
  return {
    name: room.name,
    hourlyRateEur: room.hourly_rate_eur,
    openMinute: room.open_minute ?? room.open_hour * 60,
    closeMinute: room.close_minute ?? room.close_hour * 60,
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
    open_minute: input.openMinute,
    close_minute: input.closeMinute,
    open_hour: Math.min(23, Math.floor(input.openMinute / 60)),
    close_hour: Math.min(24, Math.max(1, Math.ceil(input.closeMinute / 60))),
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

  if (input.openMinute >= input.closeMinute) {
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

export type OpeningMode = "open" | "split" | "closed";

export interface OpeningWindow {
  startMinute: number;
  endMinute: number;
}

export interface RoomOpeningDay {
  roomId: string;
  dayOfWeek: number;
  mode: OpeningMode;
  startMinute: number;
  endMinute: number;
  morningStartMinute: number;
  morningEndMinute: number;
  afternoonStartMinute: number;
  afternoonEndMinute: number;
}

export interface RoomSpecialDay {
  id: string;
  roomId: string;
  startsOn: string;
  endsOn: string;
  mode: OpeningMode;
  title: string;
  startMinute: number;
  endMinute: number;
  morningStartMinute: number;
  morningEndMinute: number;
  afternoonStartMinute: number;
  afternoonEndMinute: number;
}

export type RoomOpeningDayInput = Omit<RoomOpeningDay, "roomId">;
export type RoomSpecialDayInput = Omit<RoomSpecialDay, "id" | "roomId">;

const OPENING_DAY_COLUMNS =
  "room_id, day_of_week, mode, start_minute, end_minute, morning_start_minute, morning_end_minute, afternoon_start_minute, afternoon_end_minute";

const SPECIAL_DAY_COLUMNS =
  "id, room_id, starts_on, ends_on, mode, title, start_minute, end_minute, morning_start_minute, morning_end_minute, afternoon_start_minute, afternoon_end_minute";

function mapOpeningDay(row: {
  room_id: string;
  day_of_week: number;
  mode: OpeningMode;
  start_minute: number;
  end_minute: number;
  morning_start_minute: number;
  morning_end_minute: number;
  afternoon_start_minute: number;
  afternoon_end_minute: number;
}): RoomOpeningDay {
  return {
    roomId: row.room_id,
    dayOfWeek: row.day_of_week,
    mode: row.mode,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    morningStartMinute: row.morning_start_minute,
    morningEndMinute: row.morning_end_minute,
    afternoonStartMinute: row.afternoon_start_minute,
    afternoonEndMinute: row.afternoon_end_minute,
  };
}

function mapSpecialDay(row: {
  id: string;
  room_id: string;
  starts_on: string;
  ends_on: string;
  mode: OpeningMode;
  title: string;
  start_minute: number;
  end_minute: number;
  morning_start_minute: number;
  morning_end_minute: number;
  afternoon_start_minute: number;
  afternoon_end_minute: number;
}): RoomSpecialDay {
  return {
    id: row.id,
    roomId: row.room_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    mode: row.mode,
    title: row.title,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    morningStartMinute: row.morning_start_minute,
    morningEndMinute: row.morning_end_minute,
    afternoonStartMinute: row.afternoon_start_minute,
    afternoonEndMinute: row.afternoon_end_minute,
  };
}

export function defaultOpeningDay(
  dayOfWeek: number,
  openMinute: number,
  closeMinute: number,
): RoomOpeningDayInput {
  return {
    dayOfWeek,
    mode: "open",
    startMinute: openMinute,
    endMinute: closeMinute,
    morningStartMinute: 660,
    morningEndMinute: 840,
    afternoonStartMinute: 960,
    afternoonEndMinute: 1440,
  };
}

export function windowsFromOpening(row: {
  mode: OpeningMode;
  startMinute: number;
  endMinute: number;
  morningStartMinute: number;
  morningEndMinute: number;
  afternoonStartMinute: number;
  afternoonEndMinute: number;
}): OpeningWindow[] {
  if (row.mode === "closed") return [];
  if (row.mode === "split") {
    return [
      { startMinute: row.morningStartMinute, endMinute: row.morningEndMinute },
      {
        startMinute: row.afternoonStartMinute,
        endMinute: row.afternoonEndMinute,
      },
    ].filter((window) => window.endMinute > window.startMinute);
  }
  if (row.endMinute <= row.startMinute) return [];
  return [{ startMinute: row.startMinute, endMinute: row.endMinute }];
}

export function resolveOpeningWindows(
  date: string,
  fallback: { openMinute: number; closeMinute: number },
  weekly: RoomOpeningDay[],
  specials: RoomSpecialDay[],
): OpeningWindow[] {
  const special = specials.find(
    (row) => row.startsOn <= date && row.endsOn >= date,
  );
  if (special) return windowsFromOpening(special);

  const [year, month, day] = date.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0));
  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
  }).format(utcNoon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = map[dayOfWeek] ?? 0;
  const weeklyDay = weekly.find((row) => row.dayOfWeek === dow);
  if (weeklyDay) return windowsFromOpening(weeklyDay);
  return windowsFromOpening({
    mode: "open",
    startMinute: fallback.openMinute,
    endMinute: fallback.closeMinute,
    morningStartMinute: 660,
    morningEndMinute: 840,
    afternoonStartMinute: 960,
    afternoonEndMinute: 1440,
  });
}

export async function listRoomOpeningDays(
  client: RoomsClient,
  roomId: string,
): Promise<RoomOpeningDay[]> {
  const { data, error } = await client
    .from("room_opening_days")
    .select(OPENING_DAY_COLUMNS)
    .eq("room_id", roomId)
    .order("day_of_week", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare gli orari della sala: ${error.message}`);
  }

  return (data ?? []).map((row) =>
    mapOpeningDay(row as Parameters<typeof mapOpeningDay>[0]),
  );
}

export async function saveRoomOpeningDays(
  client: RoomsClient,
  roomId: string,
  days: RoomOpeningDayInput[],
): Promise<void> {
  const { error: deleteError } = await client
    .from("room_opening_days")
    .delete()
    .eq("room_id", roomId);

  if (deleteError) {
    throw new Error(
      `Impossibile aggiornare gli orari della sala: ${deleteError.message}`,
    );
  }

  if (days.length === 0) return;

  const { error: insertError } = await client.from("room_opening_days").insert(
    days.map((day) => ({
      room_id: roomId,
      day_of_week: day.dayOfWeek,
      mode: day.mode,
      start_minute: day.startMinute,
      end_minute: day.endMinute,
      morning_start_minute: day.morningStartMinute,
      morning_end_minute: day.morningEndMinute,
      afternoon_start_minute: day.afternoonStartMinute,
      afternoon_end_minute: day.afternoonEndMinute,
    })),
  );

  if (insertError) {
    throw new Error(
      `Impossibile salvare gli orari della sala: ${insertError.message}`,
    );
  }
}

export async function listRoomSpecialDays(
  client: RoomsClient,
  roomId: string,
): Promise<RoomSpecialDay[]> {
  const { data, error } = await client
    .from("room_special_days")
    .select(SPECIAL_DAY_COLUMNS)
    .eq("room_id", roomId)
    .order("starts_on", { ascending: false });

  if (error) {
    throw new Error(
      `Impossibile caricare i giorni speciali: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    mapSpecialDay(row as Parameters<typeof mapSpecialDay>[0]),
  );
}

export async function createRoomSpecialDay(
  client: RoomsClient,
  roomId: string,
  input: RoomSpecialDayInput,
): Promise<RoomMutationResult> {
  if (input.endsOn < input.startsOn) {
    return {
      success: false,
      errorMessage: "La data di fine deve essere successiva all'inizio.",
    };
  }

  const { error } = await client.from("room_special_days").insert({
    room_id: roomId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    mode: input.mode,
    title: input.title.trim(),
    start_minute: input.startMinute,
    end_minute: input.endMinute,
    morning_start_minute: input.morningStartMinute,
    morning_end_minute: input.morningEndMinute,
    afternoon_start_minute: input.afternoonStartMinute,
    afternoon_end_minute: input.afternoonEndMinute,
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare il giorno speciale.",
    };
  }

  return { success: true };
}

export async function deleteRoomSpecialDay(
  client: RoomsClient,
  id: string,
): Promise<RoomMutationResult> {
  const { error } = await client.from("room_special_days").delete().eq("id", id);
  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare il giorno speciale.",
    };
  }
  return { success: true };
}
