import type { SupabaseClient } from "@supabase/supabase-js";

import type { IsoWeekday } from "./lessons-settings";
import type { Database } from "./types/database";

type AvailabilityClient = SupabaseClient<Database>;

export type { IsoWeekday };

export interface TeacherAvailabilitySlot {
  id: string;
  memberId: string;
  dayOfWeek: IsoWeekday;
  startMinute: number;
  endMinute: number;
}

export type TeacherAvailabilitySlotInput = {
  dayOfWeek: IsoWeekday;
  startMinute: number;
  endMinute: number;
};

export interface TeacherTimeOff {
  id: string;
  memberId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export type CreateTeacherTimeOffInput = {
  startsAt: string;
  endsAt: string;
  reason?: string | null;
};

export type TeacherTimeOffPatch = Partial<CreateTeacherTimeOffInput>;

export interface TeacherAvailabilityMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

type AvailabilityRow = Pick<
  Database["public"]["Tables"]["teacher_availability"]["Row"],
  "id" | "member_id" | "day_of_week" | "start_minute" | "end_minute"
>;
type TimeOffRow = Pick<
  Database["public"]["Tables"]["teacher_time_off"]["Row"],
  "id" | "member_id" | "starts_at" | "ends_at" | "reason"
>;

const AVAILABILITY_COLUMNS =
  "id, member_id, day_of_week, start_minute, end_minute";

const TIME_OFF_COLUMNS = "id, member_id, starts_at, ends_at, reason";

const MIN_MINUTE = 0;
const MAX_MINUTE = 1440;

function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function mapAvailability(row: AvailabilityRow): TeacherAvailabilitySlot {
  return {
    id: row.id,
    memberId: row.member_id,
    dayOfWeek: row.day_of_week as IsoWeekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
  };
}

function mapTimeOff(row: TimeOffRow): TeacherTimeOff {
  return {
    id: row.id,
    memberId: row.member_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
  };
}

function validateAvailabilitySlot(
  slot: TeacherAvailabilitySlotInput,
): string | null {
  if (!isIsoWeekday(slot.dayOfWeek)) {
    return "Giorno della settimana non valido.";
  }
  if (
    !Number.isInteger(slot.startMinute) ||
    slot.startMinute < MIN_MINUTE ||
    slot.startMinute > MAX_MINUTE
  ) {
    return "L'orario di inizio deve essere tra 0 e 1440 minuti.";
  }
  if (
    !Number.isInteger(slot.endMinute) ||
    slot.endMinute < MIN_MINUTE ||
    slot.endMinute > MAX_MINUTE
  ) {
    return "L'orario di fine deve essere tra 0 e 1440 minuti.";
  }
  if (slot.endMinute <= slot.startMinute) {
    return "L'orario di fine deve essere successivo all'inizio.";
  }
  return null;
}

function parseInstant(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function validateTimeOffRange(
  startsAt: string,
  endsAt: string,
): string | null {
  const startMs = parseInstant(startsAt);
  const endMs = parseInstant(endsAt);
  if (startMs == null || endMs == null) {
    return "Data di inizio o fine assenza non valida.";
  }
  if (endMs <= startMs) {
    return "La fine dell'assenza deve essere successiva all'inizio.";
  }
  return null;
}

function normalizeReason(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Unisce fasce dello stesso giorno se si sovrappongono o si toccano. */
function mergeAvailabilitySlots(
  slots: TeacherAvailabilitySlotInput[],
): TeacherAvailabilitySlotInput[] {
  const byDay = new Map<IsoWeekday, TeacherAvailabilitySlotInput[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    byDay.set(slot.dayOfWeek, list);
  }

  const merged: TeacherAvailabilitySlotInput[] = [];
  const days = [...byDay.keys()].sort((a, b) => a - b);
  for (const day of days) {
    const daySlots = byDay.get(day)!;
    daySlots.sort(
      (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
    );

    let current = { ...daySlots[0] };
    for (let i = 1; i < daySlots.length; i++) {
      const next = daySlots[i];
      if (next.startMinute <= current.endMinute) {
        current.endMinute = Math.max(current.endMinute, next.endMinute);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }
  return merged;
}

export async function listTeacherAvailability(
  client: AvailabilityClient,
  memberId: string,
): Promise<TeacherAvailabilitySlot[]> {
  const { data, error } = await client
    .from("teacher_availability")
    .select(AVAILABILITY_COLUMNS)
    .eq("member_id", memberId)
    .order("day_of_week", { ascending: true })
    .order("start_minute", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare la disponibilità del docente: ${error.message}`,
    );
  }

  return (data ?? []).map(mapAvailability);
}

export async function replaceTeacherAvailability(
  client: AvailabilityClient,
  memberId: string,
  slots: TeacherAvailabilitySlotInput[],
): Promise<TeacherAvailabilityMutationResult> {
  for (const slot of slots) {
    const validationError = validateAvailabilitySlot(slot);
    if (validationError) {
      return { success: false, errorMessage: validationError };
    }
  }

  const mergedSlots = mergeAvailabilitySlots(slots);

  const { error: deleteError } = await client
    .from("teacher_availability")
    .delete()
    .eq("member_id", memberId);

  if (deleteError) {
    return {
      success: false,
      errorMessage:
        deleteError.message ||
        "Impossibile aggiornare la disponibilità del docente.",
    };
  }

  // Tabella vuota = tutto libero: non si inseriscono righe placeholder.
  if (mergedSlots.length === 0) {
    return { success: true, id: memberId };
  }

  const { error: insertError } = await client.from("teacher_availability").insert(
    mergedSlots.map((slot) => ({
      member_id: memberId,
      day_of_week: slot.dayOfWeek,
      start_minute: slot.startMinute,
      end_minute: slot.endMinute,
    })),
  );

  if (insertError) {
    return {
      success: false,
      errorMessage:
        insertError.message ||
        "Impossibile aggiornare la disponibilità del docente.",
    };
  }

  return { success: true, id: memberId };
}

export async function listTeacherTimeOff(
  client: AvailabilityClient,
  memberId: string,
  opts: { from?: string; to?: string } = {},
): Promise<TeacherTimeOff[]> {
  let query = client
    .from("teacher_time_off")
    .select(TIME_OFF_COLUMNS)
    .eq("member_id", memberId)
    .order("starts_at", { ascending: false });

  // Overlap [starts_at, ends_at) ∩ [from, to)
  if (opts.from) {
    query = query.gt("ends_at", opts.from);
  }
  if (opts.to) {
    query = query.lt("starts_at", opts.to);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Impossibile caricare le assenze del docente: ${error.message}`,
    );
  }

  return (data ?? []).map(mapTimeOff);
}

export async function createTeacherTimeOff(
  client: AvailabilityClient,
  memberId: string,
  input: CreateTeacherTimeOffInput,
): Promise<TeacherAvailabilityMutationResult> {
  const rangeError = validateTimeOffRange(input.startsAt, input.endsAt);
  if (rangeError) {
    return { success: false, errorMessage: rangeError };
  }

  const { data, error } = await client
    .from("teacher_time_off")
    .insert({
      member_id: memberId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      reason: normalizeReason(input.reason),
    })
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare l'assenza.",
    };
  }

  return { success: true, id: data.id };
}

export async function updateTeacherTimeOff(
  client: AvailabilityClient,
  id: string,
  patch: TeacherTimeOffPatch,
): Promise<TeacherAvailabilityMutationResult> {
  const row: Database["public"]["Tables"]["teacher_time_off"]["Update"] = {};
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.reason !== undefined) row.reason = normalizeReason(patch.reason);

  if (Object.keys(row).length === 0) {
    return { success: false, errorMessage: "Nessuna modifica da salvare." };
  }

  if (row.starts_at != null && row.ends_at != null) {
    const rangeError = validateTimeOffRange(row.starts_at, row.ends_at);
    if (rangeError) {
      return { success: false, errorMessage: rangeError };
    }
  }

  const { error } = await client.from("teacher_time_off").update(row).eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare l'assenza.",
    };
  }

  return { success: true, id };
}

export async function deleteTeacherTimeOff(
  client: AvailabilityClient,
  id: string,
): Promise<TeacherAvailabilityMutationResult> {
  const { error } = await client.from("teacher_time_off").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare l'assenza.",
    };
  }

  return { success: true, id };
}

/**
 * Stub: la tabella lessons non esiste ancora.
 * Fetta 5/7 compilerà i conflitti (non restringere la disponibilità
 * sotto lezioni già messe). Non inventare una query lezioni qui.
 */
export async function availabilityConflictsWithLessons(
  _client: AvailabilityClient,
  _memberId: string,
  _slots?: TeacherAvailabilitySlotInput[],
): Promise<{ conflicts: [] }> {
  return { conflicts: [] };
}
