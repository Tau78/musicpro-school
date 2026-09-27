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

export type TeacherTutorChoice = {
  id: string;
  label: string;
};

function tutorEuroLabel(amount: number): string {
  const text = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(".", ",");
  return `${text} €/ora`;
}

export async function getTeacherDefaultTutorId(
  client: CoordClient,
  memberId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("teacher_default_tutors")
    .select("tutor_member_id")
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Impossibile caricare il tutore.");
  }
  return data?.tutor_member_id ?? null;
}

export async function listTeacherTutorChoices(
  client: CoordClient,
): Promise<TeacherTutorChoice[]> {
  const { data: roles, error: rolesError } = await client
    .from("member_roles")
    .select("member_id")
    .eq("role", "docente")
    .is("revoked_at", null);
  if (rolesError) {
    throw new Error(rolesError.message || "Impossibile caricare i docenti.");
  }
  const ids = [...new Set((roles ?? []).map((row) => row.member_id))];
  if (ids.length === 0) return [];

  const [{ data: members, error: membersError }, { data: type, error: typeError }] =
    await Promise.all([
      client
        .from("members")
        .select("id, first_name, last_name")
        .in("id", ids)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      client
        .from("pay_rate_types")
        .select("id")
        .eq("slug", "coordinamento")
        .maybeSingle(),
    ]);
  if (membersError) {
    throw new Error(membersError.message || "Impossibile caricare i docenti.");
  }
  if (typeError) {
    throw new Error(typeError.message || "Impossibile caricare la voce Coordinamento.");
  }

  const rateByMember = new Map<string, number>();
  if (type?.id) {
    const { data: rates, error: ratesError } = await client
      .from("teacher_pay_rates")
      .select("member_id, amount_eur")
      .eq("pay_rate_type_id", type.id)
      .in("member_id", ids);
    if (ratesError) {
      throw new Error(ratesError.message || "Impossibile caricare le tariffe tutore.");
    }
    for (const rate of rates ?? []) {
      rateByMember.set(rate.member_id, Number(rate.amount_eur));
    }
  }

  return (members ?? []).map((member) => {
    const name = `${member.last_name} ${member.first_name}`.trim();
    const amount = rateByMember.get(member.id);
    return {
      id: member.id,
      label:
        amount != null && Number.isFinite(amount)
          ? `${name} · ${tutorEuroLabel(amount)}`
          : name,
    };
  });
}

export async function saveTeacherDefaultTutor(
  client: CoordClient,
  memberId: string,
  tutorMemberId: string | null,
): Promise<CourseMutationResult> {
  if (tutorMemberId && tutorMemberId === memberId) {
    return fail("Il tutore non può essere il docente stesso.");
  }

  if (!tutorMemberId) {
    const { error } = await client
      .from("teacher_default_tutors")
      .delete()
      .eq("member_id", memberId);
    if (error) {
      return fail(error.message || "Impossibile togliere il tutore.");
    }
  } else {
    const { error } = await client.from("teacher_default_tutors").upsert(
      {
        member_id: memberId,
        tutor_member_id: tutorMemberId,
      },
      { onConflict: "member_id" },
    );
    if (error) {
      return fail(error.message || "Impossibile salvare il tutore.");
    }
  }

  const { error: syncError } = await client.rpc("sync_teacher_default_tutor", {
    p_member_id: memberId,
  });
  if (syncError) {
    return fail(syncError.message || "Tutore salvato, ma i corsi non sono stati aggiornati.");
  }
  return ok(memberId);
}
