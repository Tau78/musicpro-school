import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSchoolCourseTerm,
  getLessonSchoolSettings,
  listCoursePackPrices,
  listLessonSubjects,
  listMemberIdsWithRole,
  listMembers,
  listRoomsForLessons,
  type Database,
  type Lesson,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

type Client = SupabaseClient<Database>;

/** Consumi wallet per riga tab Programmazione. */
export type CourseLessonProgrammingHint = {
  hasCreditConsumption: boolean;
};

export async function loadCourseLessons(
  client: Client,
  courseId: string,
): Promise<Lesson[]> {
  const { data, error } = await client
    .from("lessons")
    .select(
      "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at",
    )
    .eq("course_id", courseId)
    .is("cancelled_at", null)
    .order("sequence_number", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare le lezioni: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    sequenceNumber: row.sequence_number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    roomId: row.room_id,
    bookingId: row.booking_id,
    placement: row.placement,
    cancelledAt: row.cancelled_at,
    kind: row.kind,
    recoveredFromLessonId: row.recovered_from_lesson_id,
    makeupMemberId: row.makeup_member_id,
    parkedReason: row.parked_reason,
    originalStartsAt: row.original_starts_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Consumi wallet per lezione (tab Programmazione, verde). */
export async function loadCourseProgrammingHints(
  client: Client,
  lessonIds: string[],
): Promise<Record<string, CourseLessonProgrammingHint>> {
  if (lessonIds.length === 0) {
    return {};
  }

  const { data, error } = await client
    .from("lesson_credit_ledger")
    .select("lesson_id")
    .in("lesson_id", lessonIds)
    .eq("kind", "consumo");

  if (error) {
    throw new Error(
      `Impossibile caricare la programmazione: ${error.message}`,
    );
  }

  const hints: Record<string, CourseLessonProgrammingHint> = {};
  for (const row of data ?? []) {
    if (!row.lesson_id) continue;
    hints[row.lesson_id] = { hasCreditConsumption: true };
  }
  return hints;
}

export function roomsByIdFromList(
  rooms: { id: string; name: string }[],
): Record<string, string> {
  return Object.fromEntries(rooms.map((room) => [room.id, room.name]));
}

export async function loadCourseCreateData(client: Client, includeTeachers: boolean) {
  const [subjects, rooms, members, settings, currentTerm, packPrices, docenteIds] =
    await Promise.all([
      listLessonSubjects(client),
      listRoomsForLessons(client),
      listMembers(client),
      getLessonSchoolSettings(client),
      getCurrentSchoolCourseTerm(client),
      listCoursePackPrices(client),
      includeTeachers
        ? listMemberIdsWithRole(client, MemberRole.Docente)
        : Promise.resolve<string[]>([]),
    ]);

  const docenteIdSet = new Set(docenteIds);
  const teachers = includeTeachers
    ? members
        .filter((row) => docenteIdSet.has(row.id))
        .map((row) => ({
          id: row.id,
          label: `${row.lastName} ${row.firstName}`.trim(),
        }))
    : undefined;

  const term = currentTerm
    ? {
        id: currentTerm.id,
        label: currentTerm.label,
        startsOn: currentTerm.startsOn,
        endsOn: currentTerm.endsOn,
      }
    : null;

  return {
    subjects: subjects.map((row) => ({ id: row.id, name: row.name })),
    rooms: rooms.map((row) => ({ id: row.id, name: row.name })),
    members,
    sundayVisible: settings?.sundayVisible ?? false,
    gridOpenMinute: settings?.gridOpenMinute ?? 600,
    gridCloseMinute: settings?.gridCloseMinute ?? 1380,
    slotGranularityMinutes: settings?.slotGranularityMinutes ?? 15,
    defaultGroupCapacity: settings?.defaultGroupCapacity ?? 8,
    currentTerm: term,
    teachers,
    packPrices: packPrices.map((row) => ({
      courseKind: row.courseKind,
      durationMinutes: row.durationMinutes,
      amountEur: row.amountEur,
    })),
  };
}
