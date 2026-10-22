import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Db = SupabaseClient<Database>;

export type LessonOptionTeacher = {
  memberId: string;
  label: string;
};

export type LessonOptionCourse = {
  id: string;
  name: string;
  courseKind: Database["public"]["Tables"]["courses"]["Row"]["course_kind"];
  titularMemberId: string;
  teachers: LessonOptionTeacher[];
};

function teacherLabel(
  row: Pick<Database["public"]["Tables"]["members"]["Row"], "first_name" | "last_name">,
): string {
  return [String(row.first_name || "").trim(), String(row.last_name || "").trim()]
    .filter(Boolean)
    .join(" ");
}

function romeTodayIsoDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

export async function listEnrollmentLessonOptions(
  client?: Db,
): Promise<{ courses: LessonOptionCourse[] }> {
  const db = client ?? createServiceRoleClient();
  const today = romeTodayIsoDate();

  const { data: courses, error: coursesError } = await db
    .from("courses")
    .select("id, name, course_kind, titular_member_id, price_eur")
    .eq("status", "attivo")
    .eq("is_trial", false)
    .gt("price_eur", 0)
    .order("name", { ascending: true });

  if (coursesError) {
    throw new Error(
      coursesError.message || "Impossibile caricare i corsi per l'iscrizione.",
    );
  }

  const rows = courses ?? [];
  if (rows.length === 0) {
    return { courses: [] };
  }

  const courseIds = rows.map((c) => c.id);
  const titularIds = [...new Set(rows.map((c) => c.titular_member_id))];

  const { data: teachers, error: teachersError } = await db
    .from("course_teachers")
    .select("course_id, member_id, ends_on")
    .in("course_id", courseIds);

  if (teachersError) {
    throw new Error(
      teachersError.message || "Impossibile caricare i docenti dei corsi.",
    );
  }

  const activeTeacherIdsByCourse = new Map<string, Set<string>>();
  for (const row of teachers ?? []) {
    const endsOn = row.ends_on ? String(row.ends_on).substring(0, 10) : null;
    if (endsOn && endsOn < today) continue;
    const set =
      activeTeacherIdsByCourse.get(row.course_id) ?? new Set<string>();
    set.add(row.member_id);
    activeTeacherIdsByCourse.set(row.course_id, set);
  }

  const memberIds = new Set<string>(titularIds);
  for (const set of activeTeacherIdsByCourse.values()) {
    for (const id of set) memberIds.add(id);
  }

  const { data: members, error: membersError } = await db
    .from("members")
    .select("id, first_name, last_name")
    .in("id", [...memberIds]);

  if (membersError) {
    throw new Error(
      membersError.message || "Impossibile caricare l'anagrafica docenti.",
    );
  }

  const labelByMember = new Map<string, string>();
  for (const m of members ?? []) {
    labelByMember.set(m.id, teacherLabel(m));
  }

  const result: LessonOptionCourse[] = rows.map((course) => {
    const ids = new Set<string>([course.titular_member_id]);
    const fromTeachers = activeTeacherIdsByCourse.get(course.id);
    if (fromTeachers) {
      for (const id of fromTeachers) ids.add(id);
    }

    const teachersList: LessonOptionTeacher[] = [...ids]
      .map((memberId) => ({
        memberId,
        label: labelByMember.get(memberId) || "Docente",
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));

    return {
      id: course.id,
      name: course.name,
      courseKind: course.course_kind,
      titularMemberId: course.titular_member_id,
      teachers: teachersList,
    };
  });

  return { courses: result };
}
