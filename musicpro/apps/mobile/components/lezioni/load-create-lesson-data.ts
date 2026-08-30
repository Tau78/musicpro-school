import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSchoolCourseTerm,
  getLessonSchoolSettings,
  getTeacherProfile,
  listLessonSubjects,
  listMemberIdsWithRole,
  listMembers,
  listRooms,
  type Database,
  type MemberSummary,
} from "@musicpro/database";
import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

type Client = SupabaseClient<Database>;

export type CreateLessonTerm = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
};

export type CreateLessonTeacher = {
  id: string;
  label: string;
};

export type CreateLessonFormData = {
  subjects: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  members: MemberSummary[];
  teachers: CreateLessonTeacher[];
  sundayVisible: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  slotGranularityMinutes: number;
  defaultGroupCapacity: number;
  currentTerm: CreateLessonTerm | null;
  canCreateCourses: boolean;
  isStaff: boolean;
};

export function isLessonStaff(roles: MemberRoleValue[] | string[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export async function loadCreateLessonData(
  client: Client,
  options: {
    actorMemberId: string;
    roles: MemberRoleValue[] | string[];
  },
): Promise<CreateLessonFormData> {
  const isStaff = isLessonStaff(options.roles);

  const [subjects, rooms, members, settings, currentTerm, docenteIds, profile] =
    await Promise.all([
      listLessonSubjects(client),
      listRooms(client),
      listMembers(client),
      getLessonSchoolSettings(client),
      getCurrentSchoolCourseTerm(client),
      isStaff
        ? listMemberIdsWithRole(client, MemberRole.Docente)
        : Promise.resolve<string[]>([]),
      isStaff
        ? Promise.resolve(null)
        : getTeacherProfile(client, options.actorMemberId),
    ]);

  const docenteIdSet = new Set(docenteIds);
  const teachers = isStaff
    ? members
        .filter((row) => docenteIdSet.has(row.id))
        .map((row) => ({
          id: row.id,
          label: `${row.lastName} ${row.firstName}`.trim(),
        }))
    : [];

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
    teachers,
    sundayVisible: settings?.sundayVisible ?? false,
    gridOpenMinute: settings?.gridOpenMinute ?? 600,
    gridCloseMinute: settings?.gridCloseMinute ?? 1380,
    slotGranularityMinutes: settings?.slotGranularityMinutes ?? 15,
    defaultGroupCapacity: settings?.defaultGroupCapacity ?? 8,
    currentTerm: term,
    canCreateCourses: isStaff ? true : Boolean(profile?.canCreateCourses),
    isStaff,
  };
}
