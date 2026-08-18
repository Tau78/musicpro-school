import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSchoolCourseTerm,
  getLessonSchoolSettings,
  listLessonSubjects,
  listMemberIdsWithRole,
  listMembers,
  listRooms,
  type Database,
  type Lesson,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

type Client = SupabaseClient<Database>;

export async function loadCourseLessons(
  client: Client,
  courseId: string,
): Promise<Lesson[]> {
  const { data, error } = await client
    .from("lessons")
    .select(
      "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, created_at, updated_at",
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function roomsByIdFromList(
  rooms: { id: string; name: string }[],
): Record<string, string> {
  return Object.fromEntries(rooms.map((room) => [room.id, room.name]));
}

export async function loadCourseCreateData(client: Client, includeTeachers: boolean) {
  const [subjects, rooms, members, settings, currentTerm, docenteIds] =
    await Promise.all([
      listLessonSubjects(client),
      listRooms(client),
      listMembers(client),
      getLessonSchoolSettings(client),
      getCurrentSchoolCourseTerm(client),
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
    defaultGroupCapacity: settings?.defaultGroupCapacity ?? 8,
    currentTerm: term,
    teachers,
  };
}
