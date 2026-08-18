import type { SupabaseClient } from "@supabase/supabase-js";

import { todayInRome } from "./bookings";
import {
  getCourse,
  listCourses,
  type Course,
  type CourseMutationResult,
} from "./courses";
import type { Database } from "./types/database";

type CoordClient = SupabaseClient<Database>;

export type CourseCoordinator = {
  id: string;
  courseId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  startsOn: string;
  endsOn: string | null;
};

function fail(errorMessage: string): CourseMutationResult {
  return { success: false, errorMessage };
}

function ok(id?: string): CourseMutationResult {
  const result: CourseMutationResult = { success: true };
  if (id) result.id = id;
  return result;
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

async function isStaffMember(
  client: CoordClient,
  memberId: string,
): Promise<boolean> {
  const { data } = await client
    .from("member_roles")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  return (data ?? []).some(
    (row) => row.role === "admin" || row.role === "segreteria",
  );
}

export async function isActiveCourseCoordinator(
  client: CoordClient,
  courseId: string,
  memberId: string,
): Promise<boolean> {
  const today = todayInRome();
  const { data } = await client
    .from("course_teachers")
    .select("id")
    .eq("course_id", courseId)
    .eq("member_id", memberId)
    .eq("role", "coordinatore")
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .lte("starts_on", today)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function getActiveCourseCoordinator(
  client: CoordClient,
  courseId: string,
): Promise<CourseCoordinator | null> {
  const today = todayInRome();
  const { data, error } = await client
    .from("course_teachers")
    .select("id, course_id, member_id, starts_on, ends_on")
    .eq("course_id", courseId)
    .eq("role", "coordinatore")
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .lte("starts_on", today)
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const { data: member } = await client
    .from("members")
    .select("first_name, last_name")
    .eq("id", data.member_id)
    .maybeSingle();

  return {
    id: data.id,
    courseId: data.course_id,
    memberId: data.member_id,
    firstName: member?.first_name ?? "",
    lastName: member?.last_name ?? "",
    startsOn: data.starts_on,
    endsOn: data.ends_on,
  };
}

export async function listCoordinatedCourses(
  client: CoordClient,
  memberId: string,
): Promise<Course[]> {
  const today = todayInRome();
  const { data: rows, error } = await client
    .from("course_teachers")
    .select("course_id")
    .eq("member_id", memberId)
    .eq("role", "coordinatore")
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .lte("starts_on", today);
  if (error) {
    throw new Error(
      error.message || "Impossibile caricare i corsi coordinati.",
    );
  }
  const ids = [...new Set((rows ?? []).map((row) => row.course_id))];
  if (ids.length === 0) return [];
  const courses = await listCourses(client);
  return courses.filter((course) => ids.includes(course.id));
}

export async function assignCourseCoordinator(
  client: CoordClient,
  input: {
    courseId: string;
    coordinatorMemberId: string;
    startsOn?: string;
    actorMemberId: string;
  },
): Promise<CourseMutationResult> {
  const staff = await isStaffMember(client, input.actorMemberId);
  if (!staff) return fail("Solo lo staff assegna il coordinatore.");

  const course = await getCourse(client, input.courseId);
  if (!course) return fail("Corso non trovato.");
  if (course.isTrial) return fail("La prova non ha un coordinatore.");
  if (input.coordinatorMemberId === course.titularMemberId) {
    return fail("Il coordinatore non può essere il titolare dello stesso corso.");
  }

  const { data: roleRow, error: roleError } = await client
    .from("member_roles")
    .select("id")
    .eq("member_id", input.coordinatorMemberId)
    .eq("role", "docente")
    .is("revoked_at", null)
    .maybeSingle();
  if (roleError) {
    return fail(roleError.message || "Impossibile verificare il ruolo docente.");
  }
  if (!roleRow) return fail("Il coordinatore deve avere il ruolo docente.");

  const startsOn = input.startsOn?.trim() || todayInRome();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
    return fail("La data di decorrenza non è valida.");
  }

  const { data: current, error: currentError } = await client
    .from("course_teachers")
    .select("id, member_id, starts_on")
    .eq("course_id", input.courseId)
    .eq("role", "coordinatore")
    .is("ends_on", null)
    .maybeSingle();
  if (currentError) {
    return fail(
      currentError.message || "Impossibile caricare il coordinatore attuale.",
    );
  }

  if (current?.member_id === input.coordinatorMemberId) {
    return ok(current.id);
  }

  if (current) {
    const endsOn = addDaysIso(startsOn, -1);
    const closedOn =
      endsOn < current.starts_on ? current.starts_on : endsOn;
    const { error: closeError } = await client
      .from("course_teachers")
      .update({ ends_on: closedOn })
      .eq("id", current.id);
    if (closeError) {
      return fail(
        closeError.message || "Impossibile chiudere il coordinatore attuale.",
      );
    }
  }

  const { data: inserted, error: insertError } = await client
    .from("course_teachers")
    .insert({
      course_id: input.courseId,
      member_id: input.coordinatorMemberId,
      role: "coordinatore",
      starts_on: startsOn,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return fail(insertError?.message || "Impossibile assegnare il coordinatore.");
  }
  return ok(inserted.id);
}

export async function endCourseCoordinator(
  client: CoordClient,
  input: {
    courseId: string;
    actorMemberId: string;
    endsOn?: string;
  },
): Promise<CourseMutationResult> {
  const staff = await isStaffMember(client, input.actorMemberId);
  if (!staff) return fail("Solo lo staff toglie il coordinatore.");

  const endsOn = input.endsOn?.trim() || todayInRome();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
    return fail("La data di fine non è valida.");
  }

  const { data: current, error } = await client
    .from("course_teachers")
    .select("id, starts_on")
    .eq("course_id", input.courseId)
    .eq("role", "coordinatore")
    .is("ends_on", null)
    .maybeSingle();
  if (error) {
    return fail(error.message || "Impossibile caricare il coordinatore.");
  }
  if (!current) return fail("Nessun coordinatore attivo su questo corso.");

  const closedOn =
    endsOn < current.starts_on ? current.starts_on : endsOn;
  const { error: updateError } = await client
    .from("course_teachers")
    .update({ ends_on: closedOn })
    .eq("id", current.id);
  if (updateError) {
    return fail(updateError.message || "Impossibile togliere il coordinatore.");
  }
  return ok(current.id);
}
