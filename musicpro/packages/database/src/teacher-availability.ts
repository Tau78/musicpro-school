import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getRomeDayOfWeek,
  getRomeMinutesFromMidnight,
} from "./bookings";
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

export type LessonAvailabilityConflict = {
  lessonId: string;
  startsAt: string;
  courseId: string;
};

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

  try {
    const { conflicts } = await availabilityConflictsWithLessons(
      client,
      memberId,
      mergedSlots,
    );
    if (conflicts.length > 0) {
      return {
        success: false,
        errorMessage:
          "Ci sono lezioni già in calendario in quelle fasce. Spostale o usa «Docente assente».",
      };
    }
  } catch (err) {
    return {
      success: false,
      errorMessage:
        err instanceof Error
          ? err.message
          : "Impossibile verificare i conflitti con le lezioni.",
    };
  }

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

  try {
    const { conflicts } = await availabilityConflictsWithLessons(
      client,
      memberId,
      undefined,
      { from: input.startsAt, to: input.endsAt },
    );
    if (conflicts.length > 0) {
      return {
        success: false,
        errorMessage:
          "Ci sono lezioni già in calendario in quelle fasce. Spostale o usa «Docente assente».",
      };
    }
  } catch (err) {
    return {
      success: false,
      errorMessage:
        err instanceof Error
          ? err.message
          : "Impossibile verificare i conflitti con le lezioni.",
    };
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

function romeIsoWeekday(iso: string): IsoWeekday {
  const dow = getRomeDayOfWeek(iso);
  return (dow === 0 ? 7 : dow) as IsoWeekday;
}

function lessonFitsAvailabilitySlot(
  startsAt: string,
  endsAt: string | null,
  slots: TeacherAvailabilitySlotInput[],
): boolean {
  const weekday = romeIsoWeekday(startsAt);
  const startMinute = getRomeMinutesFromMidnight(startsAt);
  const endMinute = endsAt
    ? getRomeMinutesFromMidnight(endsAt)
    : startMinute;
  const daySlots = slots.filter((slot) => slot.dayOfWeek === weekday);
  if (daySlots.length === 0) {
    // Domenica nascosta: senza fascia non è un conflitto.
    return weekday === 7;
  }
  return daySlots.some(
    (slot) =>
      startMinute >= slot.startMinute && endMinute <= slot.endMinute,
  );
}

export async function availabilityConflictsWithLessons(
  client: AvailabilityClient,
  memberId: string,
  slots?: TeacherAvailabilitySlotInput[],
  range?: { from: string; to: string },
): Promise<{ conflicts: LessonAvailabilityConflict[] }> {
  if (!range && (slots == null || slots.length === 0)) {
    return { conflicts: [] };
  }

  const { data: courses, error: coursesError } = await client
    .from("courses")
    .select("id")
    .eq("titular_member_id", memberId);
  if (coursesError) {
    throw new Error(
      `Impossibile caricare i corsi del docente: ${coursesError.message}`,
    );
  }
  const courseIds = (courses ?? []).map((row) => row.id);
  if (courseIds.length === 0) return { conflicts: [] };

  const { data: lessonRows, error: lessonsError } = await client
    .from("lessons")
    .select("id, course_id, starts_at, ends_at")
    .in("course_id", courseIds)
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .not("starts_at", "is", null);
  if (lessonsError) {
    throw new Error(
      `Impossibile caricare le lezioni del docente: ${lessonsError.message}`,
    );
  }

  const conflicts: LessonAvailabilityConflict[] = [];
  for (const row of lessonRows ?? []) {
    if (!row.starts_at) continue;
    if (range) {
      const endsAt = row.ends_at ?? row.starts_at;
      if (!(row.starts_at < range.to && endsAt > range.from)) continue;
    } else if (slots) {
      if (lessonFitsAvailabilitySlot(row.starts_at, row.ends_at, slots)) {
        continue;
      }
    } else {
      continue;
    }
    conflicts.push({
      lessonId: row.id,
      startsAt: row.starts_at,
      courseId: row.course_id,
    });
  }

  return { conflicts };
}
