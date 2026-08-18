import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getRomeDayOfWeek,
  getRomeMinutesFromMidnight,
  getRoomById,
  todayInRome,
} from "./bookings";
import {
  cancelHoldBooking,
  createCourse,
  createLessonBooking,
  getCourse,
  listCourses,
  type Course,
  type CourseDetail,
  type CourseDurationMinutes,
  type CourseMutationResult,
  type IsoWeekday,
} from "./courses";
import { moveLesson } from "./lessons-calendar";
import { getCurrentSchoolCourseTerm } from "./lessons-settings";
import { sendSingleEmail } from "./messaging";
import { upsertAppSetting } from "./settings";
import type { Database } from "./types/database";

type TrialsClient = SupabaseClient<Database>;

type MemberTrialRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  is_enrollment_draft: boolean;
  draft_expires_at: string | null;
  manual_tutor_first_name: string | null;
  manual_tutor_last_name: string | null;
  manual_tutor_email: string | null;
  manual_tutor_phone: string | null;
};

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

const ROME = "Europe/Rome";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRIAL_DURATIONS = new Set<number>([30, 45, 60]);
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_KEY_PREFIX = "iscrizione_token:";
const MEMBER_TRIAL_COLUMNS =
  "id, first_name, last_name, email, phone, birth_date, is_enrollment_draft, draft_expires_at, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_email, manual_tutor_phone";

export type CreateTrialActor = {
  memberId: string;
  isStaff: boolean;
  canCreateCourses: boolean;
};

export type CreateTrialInput = {
  subjectId: string;
  titularMemberId: string;
  startsAt: string;
  durationMinutes: 30 | 45 | 60;
  roomId: string | null;
  online: boolean;
  student: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone?: string | null;
    birthDate?: string | null;
    tutorFirstName?: string | null;
    tutorLastName?: string | null;
    tutorEmail?: string | null;
    tutorPhone?: string | null;
  };
};

function fail(
  errorMessage: string,
  extras: Partial<CourseMutationResult> = {},
): CourseMutationResult {
  return { success: false, errorMessage, ...extras };
}

function ok(id?: string, warnings?: string[]): CourseMutationResult {
  const result: CourseMutationResult = { success: true };
  if (id) result.id = id;
  if (warnings && warnings.length > 0) result.warnings = warnings;
  return result;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = emptyToNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatRomeDate(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatRomeTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function toIsoWeekday(jsDow: number): IsoWeekday {
  const dow = jsDow === 0 ? 7 : jsDow;
  return dow as IsoWeekday;
}

function ageOnRomeDate(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

function isMinorOnRomeToday(birthDate: string | null | undefined): boolean {
  if (!birthDate || !ISO_DATE_RE.test(birthDate)) return false;
  return ageOnRomeDate(birthDate, todayInRome()) < 18;
}

function memberLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function clampDate(date: string, min: string, max: string): string {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function asCourseDuration(minutes: number): CourseDurationMinutes | null {
  if (minutes === 30 || minutes === 45 || minutes === 60 || minutes === 90) {
    return minutes;
  }
  return null;
}

function manageTrialError(
  actor: CreateTrialActor,
  titularMemberId: string,
): string | null {
  if (actor.isStaff) return null;
  if (!actor.canCreateCourses) {
    return "Non hai il permesso di gestire le prove.";
  }
  if (titularMemberId !== actor.memberId) {
    return "Puoi gestire solo le prove di cui sei titolare.";
  }
  return null;
}

function createIscrizioneToken(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Impossibile generare il token di iscrizione.");
  }
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function iscrizioneLink(token: string): string {
  const base = (
    process.env.STRIPE_RETURN_URL || "https://iscrizione.musicproeventi.it/"
  )
    .replace(/[?&].*$/, "")
    .replace(/\/?$/, "/");
  return `${base}?iscrizioneToken=${token}`;
}

function emailsEqual(
  left: string | null | undefined,
  right: string,
): boolean {
  return normalizeEmail(left) === right;
}

async function findMemberByContactEmail(
  client: TrialsClient,
  email: string,
): Promise<MemberTrialRow | null> {
  const target = normalizeEmail(email);
  if (!target) return null;

  const { data: byEmail, error: emailError } = await client
    .from("members")
    .select(MEMBER_TRIAL_COLUMNS)
    .ilike("email", target);

  if (emailError) {
    throw new Error(
      emailError.message || "Impossibile cercare l'anagrafica per email.",
    );
  }

  const emailMatch = ((byEmail ?? []) as MemberTrialRow[]).find(
    (row) => emailsEqual(row.email, target) || emailsEqual(row.manual_tutor_email, target),
  );
  if (emailMatch) return emailMatch;

  const { data: byTutor, error: tutorError } = await client
    .from("members")
    .select(MEMBER_TRIAL_COLUMNS)
    .ilike("manual_tutor_email", target);

  if (tutorError) {
    throw new Error(
      tutorError.message || "Impossibile cercare l'anagrafica per email tutore.",
    );
  }

  return (
    ((byTutor ?? []) as MemberTrialRow[]).find(
      (row) =>
        emailsEqual(row.email, target) || emailsEqual(row.manual_tutor_email, target),
    ) ?? null
  );
}

async function upsertDraftMember(
  client: TrialsClient,
  student: CreateTrialInput["student"],
): Promise<{ member: MemberTrialRow } | { errorMessage: string }> {
  const firstName = student.firstName.trim();
  const lastName = student.lastName.trim();
  if (!firstName || !lastName) {
    return { errorMessage: "Nome e cognome dell'allievo sono obbligatori." };
  }

  const studentEmail = emptyToNull(student.email);
  const tutorEmail = emptyToNull(student.tutorEmail);
  if (!studentEmail && !tutorEmail) {
    return { errorMessage: "Serve l'email dell'allievo o del tutore." };
  }

  const birthDate = emptyToNull(student.birthDate);
  if (birthDate && !ISO_DATE_RE.test(birthDate)) {
    return { errorMessage: "La data di nascita non è valida." };
  }
  if (birthDate && isMinorOnRomeToday(birthDate)) {
    const tutorFirst = emptyToNull(student.tutorFirstName);
    const tutorLast = emptyToNull(student.tutorLastName);
    if (!tutorFirst || !tutorLast || !tutorEmail) {
      return {
        errorMessage:
          "Per i minorenni servono nome, cognome ed email del tutore.",
      };
    }
  }

  const lookupEmail = studentEmail ?? tutorEmail;
  if (!lookupEmail) {
    return { errorMessage: "Serve l'email dell'allievo o del tutore." };
  }

  let existing: MemberTrialRow | null;
  try {
    existing = await findMemberByContactEmail(client, lookupEmail);
  } catch (err) {
    return {
      errorMessage:
        err instanceof Error
          ? err.message
          : "Impossibile cercare l'anagrafica.",
    };
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();

  if (existing) {
    if (existing.is_enrollment_draft) {
      const { error } = await client
        .from("members")
        .update({ draft_expires_at: expiresAt })
        .eq("id", existing.id);
      if (error) {
        return {
          errorMessage:
            error.message || "Impossibile aggiornare la bozza anagrafica.",
        };
      }
      return { member: { ...existing, draft_expires_at: expiresAt } };
    }
    return { member: existing };
  }

  const memberEmail = studentEmail ?? tutorEmail;
  const { data, error } = await client
    .from("members")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: memberEmail,
      phone: emptyToNull(student.phone),
      birth_date: birthDate,
      manual_tutor_first_name: emptyToNull(student.tutorFirstName),
      manual_tutor_last_name: emptyToNull(student.tutorLastName),
      manual_tutor_email: tutorEmail,
      manual_tutor_phone: emptyToNull(student.tutorPhone),
      is_enrollment_draft: true,
      member_number: null,
      draft_expires_at: expiresAt,
      is_active: true,
    })
    .select(MEMBER_TRIAL_COLUMNS)
    .single();

  if (error || !data) {
    return {
      errorMessage: error?.message || "Impossibile creare la bozza anagrafica.",
    };
  }

  return { member: data as MemberTrialRow };
}

async function memberHasActiveTrial(
  client: TrialsClient,
  memberId: string,
  termId: string,
): Promise<{ exists: boolean; errorMessage?: string }> {
  const { data: enrollments, error: enrollmentError } = await client
    .from("course_enrollments")
    .select("course_id")
    .eq("member_id", memberId)
    .is("left_at", null);

  if (enrollmentError) {
    return {
      exists: false,
      errorMessage:
        enrollmentError.message ||
        "Impossibile verificare le prove già assegnate.",
    };
  }

  const courseIds = (enrollments ?? []).map((row) => row.course_id);
  if (courseIds.length === 0) return { exists: false };

  const { data, error } = await client
    .from("courses")
    .select("id")
    .in("id", courseIds)
    .eq("is_trial", true)
    .eq("term_id", termId)
    .in("status", ["attivo", "in_attesa", "in_pausa"])
    .limit(1);

  if (error) {
    return {
      exists: false,
      errorMessage:
        error.message || "Impossibile verificare le prove già assegnate.",
    };
  }

  return { exists: (data?.length ?? 0) > 0 };
}

async function loadTrialCourse(
  client: TrialsClient,
  courseId: string,
): Promise<{ course: CourseDetail } | { errorMessage: string }> {
  try {
    const course = await getCourse(client, courseId);
    if (!course) return { errorMessage: "Prova non trovata." };
    if (!course.isTrial) return { errorMessage: "Questo corso non è una prova." };
    return { course };
  } catch (err) {
    return {
      errorMessage:
        err instanceof Error ? err.message : "Impossibile caricare la prova.",
    };
  }
}

async function loadProvaLesson(
  client: TrialsClient,
  courseId: string,
): Promise<{ lesson: LessonRow } | { errorMessage: string }> {
  const { data, error } = await client
    .from("lessons")
    .select(
      "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at",
    )
    .eq("course_id", courseId)
    .eq("kind", "prova")
    .order("sequence_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      errorMessage: error.message || "Impossibile caricare la lezione di prova.",
    };
  }
  if (!data) return { errorMessage: "Lezione di prova non trovata." };
  return { lesson: data };
}

async function loadMemberTrialRow(
  client: TrialsClient,
  memberId: string,
): Promise<{ member: MemberTrialRow } | { errorMessage: string }> {
  const { data, error } = await client
    .from("members")
    .select(MEMBER_TRIAL_COLUMNS)
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    return {
      errorMessage: error.message || "Impossibile caricare l'allievo.",
    };
  }
  if (!data) return { errorMessage: "Allievo non trovato." };
  return { member: data as MemberTrialRow };
}

async function deleteTrialCourse(
  client: TrialsClient,
  courseId: string,
  bookingId: string | null,
): Promise<void> {
  await cancelHoldBooking(client, bookingId);
  await client.from("courses").delete().eq("id", courseId);
}

function welcomeRecipient(member: MemberTrialRow): string | null {
  const tutorEmail = emptyToNull(member.manual_tutor_email);
  const studentEmail = emptyToNull(member.email);
  const tutorPresent = Boolean(
    emptyToNull(member.manual_tutor_first_name) ||
      emptyToNull(member.manual_tutor_last_name) ||
      tutorEmail,
  );
  if ((isMinorOnRomeToday(member.birth_date) || tutorPresent) && tutorEmail) {
    return tutorEmail;
  }
  return studentEmail ?? tutorEmail;
}

function tokenEmail(member: MemberTrialRow): string | null {
  return emptyToNull(member.email) ?? emptyToNull(member.manual_tutor_email);
}

export async function sendTrialWelcomeEmail(
  client: TrialsClient,
  courseId: string,
): Promise<CourseMutationResult> {
  const loaded = await loadTrialCourse(client, courseId);
  if ("errorMessage" in loaded) return fail(loaded.errorMessage);

  const course = loaded.course;
  const enrollment = course.enrollments.find((row) => !row.leftAt);
  if (!enrollment) {
    return ok(courseId, ["Manca l'allievo: email di benvenuto non inviata."]);
  }

  const memberRes = await loadMemberTrialRow(client, enrollment.memberId);
  if ("errorMessage" in memberRes) {
    return ok(courseId, [memberRes.errorMessage]);
  }
  const member = memberRes.member;

  const lessonRes = await loadProvaLesson(client, courseId);
  if ("errorMessage" in lessonRes) {
    return ok(courseId, [lessonRes.errorMessage]);
  }
  const lesson = lessonRes.lesson;
  if (!lesson.starts_at) {
    return ok(courseId, ["La prova non ha data e ora: email non inviata."]);
  }

  const recipient = welcomeRecipient(member);
  const lookupEmail = tokenEmail(member);
  if (!recipient || !lookupEmail) {
    return ok(courseId, [
      "Manca l'email per inviare il link di iscrizione.",
    ]);
  }

  const dateLabel = formatRomeDate(lesson.starts_at);
  const timeLabel = formatRomeTime(lesson.starts_at);
  let placeLabel = "Online";
  const roomId = lesson.room_id ?? course.roomId;
  if (course.courseKind !== "online" && roomId) {
    try {
      const room = await getRoomById(client, roomId);
      placeLabel = room?.name ?? "Sala da confermare";
    } catch {
      placeLabel = "Sala da confermare";
    }
  }

  const teacherName = course.titular
    ? `${course.titular.firstName} ${course.titular.lastName}`.trim()
    : "il tuo docente";

  let token: string;
  try {
    token = createIscrizioneToken();
  } catch (err) {
    return ok(courseId, [
      err instanceof Error
        ? err.message
        : "Impossibile generare il link di iscrizione.",
    ]);
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();
  const stored = await upsertAppSetting(
    client,
    `${TOKEN_KEY_PREFIX}${token}`,
    JSON.stringify({ email: lookupEmail, expiresAt, usedAt: null }),
    "Magic link iscrizione prova",
  );
  if (!stored.success) {
    return ok(courseId, [
      stored.errorMessage || "Impossibile salvare il link di iscrizione.",
    ]);
  }

  const link = iscrizioneLink(token);
  const subject = `Prova MusicPro — ${dateLabel} ${timeLabel}`;
  const body = [
    `Ciao ${member.first_name},`,
    "",
    "ti aspettiamo per una lezione di prova presso MusicPro School.",
    "",
    `Data e ora: ${dateLabel} alle ${timeLabel}`,
    `Sala: ${placeLabel}`,
    `Docente: ${teacherName}`,
    "",
    "Completa il modulo di iscrizione (i campi sono precompilati e modificabili):",
    link,
    "",
    "Il link è valido 30 giorni.",
    "",
    "A presto,",
    "MusicPro School",
  ].join("\n");

  const sent = await sendSingleEmail(client, { to: recipient, subject, body });
  if (sent.ok) return ok(courseId);
  return ok(courseId, [sent.error]);
}

export async function createTrial(
  client: TrialsClient,
  input: CreateTrialInput,
  actor: CreateTrialActor,
): Promise<CourseMutationResult> {
  if (!actor.isStaff) {
    if (!actor.canCreateCourses) {
      return fail("Non hai il permesso di creare prove.");
    }
    if (input.titularMemberId !== actor.memberId) {
      return fail("Puoi creare prove solo come titolare.");
    }
  }

  if (!TRIAL_DURATIONS.has(input.durationMinutes)) {
    return fail("La durata deve essere 30, 45 o 60 minuti.");
  }

  const startsMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startsMs)) {
    return fail("Data e ora della prova non valide.");
  }
  const startsAt = new Date(startsMs).toISOString();
  const endsAt = addMinutesIso(startsAt, input.durationMinutes);
  const startsOn = dateInRome(startsAt);

  if (input.online) {
    if (input.roomId) {
      return fail("Una prova online non può avere una sala.");
    }
  } else if (!input.roomId) {
    return fail("La sala è obbligatoria per una prova in presenza.");
  }

  let term;
  try {
    term = await getCurrentSchoolCourseTerm(client);
  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "Impossibile caricare l'anno corsi.",
    );
  }
  if (!term) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }
  if (startsOn < term.startsOn || startsOn > term.endsOn) {
    return fail("La data della prova deve essere nell'anno corsi.");
  }

  const subjectRes = await client
    .from("lesson_subjects")
    .select("id, name")
    .eq("id", input.subjectId)
    .maybeSingle();
  if (subjectRes.error) {
    return fail(subjectRes.error.message || "Impossibile caricare la materia.");
  }
  if (!subjectRes.data) {
    return fail("Materia non trovata.");
  }

  const upserted = await upsertDraftMember(client, input.student);
  if ("errorMessage" in upserted) return fail(upserted.errorMessage);
  const member = upserted.member;

  const already = await memberHasActiveTrial(client, member.id, term.id);
  if (already.errorMessage) return fail(already.errorMessage);
  if (already.exists) {
    return fail("Questo allievo ha già una prova in questa stagione.");
  }

  const name = `Prova — ${memberLabel(member.last_name, member.first_name)} — ${subjectRes.data.name}`;
  const weeklyDow = toIsoWeekday(getRomeDayOfWeek(startsAt));
  const weeklyStartMinute = getRomeMinutesFromMidnight(startsAt);
  const courseKind = input.online ? "online" : "individuale";
  const roomId = input.online ? null : input.roomId;

  const { data: inserted, error: insertError } = await client
    .from("courses")
    .insert({
      name,
      course_kind: courseKind,
      status: "attivo",
      subject_id: input.subjectId,
      titular_member_id: input.titularMemberId,
      room_id: roomId,
      duration_minutes: input.durationMinutes,
      weekly_dow: weeklyDow,
      weekly_start_minute: weeklyStartMinute,
      starts_on: startsOn,
      term_id: term.id,
      max_students: 1,
      price_eur: 0,
      pay_amount_eur: null,
      hold_until: null,
      created_by: actor.memberId,
      is_trial: true,
      trial_reschedule_used: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return fail(insertError?.message || "Impossibile creare la prova.");
  }

  const courseId = inserted.id;

  const { error: teacherError } = await client.from("course_teachers").insert({
    course_id: courseId,
    member_id: input.titularMemberId,
    role: "titolare",
    starts_on: startsOn,
  });
  if (teacherError) {
    await deleteTrialCourse(client, courseId, null);
    return fail(teacherError.message || "Impossibile assegnare il titolare.");
  }

  const { error: enrollmentError } = await client
    .from("course_enrollments")
    .insert({
      course_id: courseId,
      member_id: member.id,
      opening_prepaid_lessons: 0,
    });
  if (enrollmentError) {
    await deleteTrialCourse(client, courseId, null);
    return fail(
      enrollmentError.message || "Impossibile iscrivere l'allievo alla prova.",
    );
  }

  let bookingId: string | null = null;
  if (roomId) {
    const booked = await createLessonBooking(client, {
      roomId,
      memberId: input.titularMemberId,
      startAt: startsAt,
      endAt: endsAt,
      title: `Prova: ${memberLabel(member.last_name, member.first_name)}`,
    });
    if (!booked.bookingId) {
      await deleteTrialCourse(client, courseId, null);
      return fail(booked.errorMessage || "Impossibile occupare la sala.");
    }
    bookingId = booked.bookingId;
  }

  const { error: lessonError } = await client.from("lessons").insert({
    course_id: courseId,
    sequence_number: 1,
    starts_at: startsAt,
    ends_at: endsAt,
    room_id: roomId,
    booking_id: bookingId,
    placement: "scheduled",
    kind: "prova",
  });
  if (lessonError) {
    await deleteTrialCourse(client, courseId, bookingId);
    return fail(lessonError.message || "Impossibile creare la lezione di prova.");
  }

  const emailed = await sendTrialWelcomeEmail(client, courseId);
  const warnings = [...(emailed.warnings ?? [])];
  if (!emailed.success && emailed.errorMessage) {
    warnings.push(emailed.errorMessage);
  }
  return ok(courseId, warnings);
}

export async function rescheduleTrial(
  client: TrialsClient,
  courseId: string,
  startsAt: string,
  roomId: string | null,
  actor: CreateTrialActor,
): Promise<CourseMutationResult> {
  const startsMs = Date.parse(startsAt);
  if (!Number.isFinite(startsMs)) {
    return fail("Data e ora della prova non valide.");
  }
  const nextStartsAt = new Date(startsMs).toISOString();

  const loaded = await loadTrialCourse(client, courseId);
  if ("errorMessage" in loaded) return fail(loaded.errorMessage);
  const course = loaded.course;

  const denied = manageTrialError(actor, course.titularMemberId);
  if (denied) return fail(denied);

  if (course.status === "chiuso") {
    return fail("La prova è già stata chiusa.");
  }
  if (course.convertedToCourseId) {
    return fail("La prova è già stata convertita.");
  }
  if (course.trialRescheduleUsed) {
    return fail("La prova è già stata riprogrammata.");
  }

  let term;
  try {
    term = await getCurrentSchoolCourseTerm(client);
  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "Impossibile caricare l'anno corsi.",
    );
  }
  if (!term) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }
  const nextDate = dateInRome(nextStartsAt);
  if (nextDate < term.startsOn || nextDate > term.endsOn) {
    return fail("La data della prova deve essere nell'anno corsi.");
  }

  if (course.courseKind === "online") {
    if (roomId) {
      return fail("Una prova online non può avere una sala.");
    }
  } else if (!roomId) {
    return fail("La sala è obbligatoria per una prova in presenza.");
  }

  const lessonRes = await loadProvaLesson(client, courseId);
  if ("errorMessage" in lessonRes) return fail(lessonRes.errorMessage);
  const lesson = lessonRes.lesson;
  if (lesson.cancelled_at) {
    return fail("La lezione di prova è stata annullata.");
  }

  const moved = await moveLesson(client, lesson.id, {
    startsAt: nextStartsAt,
    roomId,
    scope: "this",
  });
  if (!moved.success) return moved;

  const { error } = await client
    .from("courses")
    .update({
      trial_reschedule_used: true,
      starts_on: nextDate,
      weekly_dow: toIsoWeekday(getRomeDayOfWeek(nextStartsAt)),
      weekly_start_minute: getRomeMinutesFromMidnight(nextStartsAt),
      room_id: course.courseKind === "online" ? null : roomId,
    })
    .eq("id", courseId);

  if (error) {
    return fail(
      error.message || "Prova spostata, ma non è stato salvato il flag di riprogrammazione.",
      { id: courseId, warnings: moved.warnings },
    );
  }

  return ok(courseId, moved.warnings);
}

export async function cancelTrial(
  client: TrialsClient,
  courseId: string,
  actor: CreateTrialActor,
): Promise<CourseMutationResult> {
  const loaded = await loadTrialCourse(client, courseId);
  if ("errorMessage" in loaded) return fail(loaded.errorMessage);
  const course = loaded.course;

  const denied = manageTrialError(actor, course.titularMemberId);
  if (denied) return fail(denied);

  if (course.status === "chiuso") {
    return fail("La prova è già stata chiusa.");
  }
  if (course.convertedToCourseId) {
    return fail("La prova è già stata convertita.");
  }

  const lessonRes = await loadProvaLesson(client, courseId);
  if ("errorMessage" in lessonRes) return fail(lessonRes.errorMessage);
  const lesson = lessonRes.lesson;

  const cancelError = await cancelHoldBooking(client, lesson.booking_id);
  if (cancelError) return fail(cancelError);

  if (!lesson.cancelled_at) {
    const { error: lessonError } = await client
      .from("lessons")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", lesson.id);
    if (lessonError) {
      return fail(
        lessonError.message || "Impossibile annullare la lezione di prova.",
      );
    }
  }

  const { error } = await client
    .from("courses")
    .update({
      status: "chiuso",
      closed_on: todayInRome(),
    })
    .eq("id", courseId);

  if (error) {
    return fail(error.message || "Impossibile chiudere la prova.");
  }

  return ok(courseId);
}

export async function convertTrialToCourse(
  client: TrialsClient,
  courseId: string,
  actor: CreateTrialActor,
): Promise<CourseMutationResult> {
  const loaded = await loadTrialCourse(client, courseId);
  if ("errorMessage" in loaded) return fail(loaded.errorMessage);
  const course = loaded.course;

  const denied = manageTrialError(actor, course.titularMemberId);
  if (denied) return fail(denied);

  if (course.status === "chiuso") {
    return fail("La prova è già stata chiusa.");
  }
  if (course.convertedToCourseId) {
    return fail("La prova è già stata convertita.");
  }

  const enrollment = course.enrollments.find((row) => !row.leftAt);
  if (!enrollment) {
    return fail("Manca l'allievo della prova.");
  }

  const memberRes = await loadMemberTrialRow(client, enrollment.memberId);
  if ("errorMessage" in memberRes) return fail(memberRes.errorMessage);
  const member = memberRes.member;

  if (member.is_enrollment_draft && !actor.isStaff) {
    return fail("Completa il modulo di iscrizione prima di convertire");
  }

  const mappedDuration = asCourseDuration(course.durationMinutes);
  if (
    mappedDuration !== 30 &&
    mappedDuration !== 45 &&
    mappedDuration !== 60
  ) {
    return fail("La durata della prova non è convertibile in un corso.");
  }

  const lessonRes = await loadProvaLesson(client, courseId);
  if ("errorMessage" in lessonRes) return fail(lessonRes.errorMessage);
  const lesson = lessonRes.lesson;

  let term;
  try {
    term = await getCurrentSchoolCourseTerm(client);
  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "Impossibile caricare l'anno corsi.",
    );
  }
  if (!term) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }

  const today = todayInRome();
  const lessonDate = lesson.starts_at ? dateInRome(lesson.starts_at) : course.startsOn;
  const proposed = lessonDate >= today ? lessonDate : today;
  const startsOn = clampDate(proposed, term.startsOn, term.endsOn);

  const weeklyDow: IsoWeekday = lesson.starts_at
    ? toIsoWeekday(getRomeDayOfWeek(lesson.starts_at))
    : course.weeklyDow;
  const weeklyStartMinute = lesson.starts_at
    ? getRomeMinutesFromMidnight(lesson.starts_at)
    : course.weeklyStartMinute;
  const roomId =
    course.courseKind === "online"
      ? null
      : (lesson.room_id ?? course.roomId);

  // Libera la sala della prova prima di generare il corso (stesso slot).
  // La riga lezione resta per lo storico, senza booking.
  if (lesson.booking_id) {
    const cancelError = await cancelHoldBooking(client, lesson.booking_id);
    if (cancelError) {
      return fail(cancelError);
    }
    const { error: clearError } = await client
      .from("lessons")
      .update({ booking_id: null })
      .eq("id", lesson.id);
    if (clearError) {
      return fail(
        clearError.message || "Impossibile liberare la sala della prova.",
      );
    }
  }

  const created = await createCourse(
    client,
    {
      courseKind: course.courseKind,
      subjectId: course.subjectId,
      titularMemberId: course.titularMemberId,
      studentMemberIds: [member.id],
      roomId,
      durationMinutes: mappedDuration,
      weeklyDow,
      weeklyStartMinute,
      startsOn,
      allowDraftEnrollment: actor.isStaff,
    },
    { ...actor, isStaff: true },
  );

  if (!created.success || !created.id) {
    return created;
  }

  const { error } = await client
    .from("courses")
    .update({
      converted_to_course_id: created.id,
      status: "chiuso",
      closed_on: today,
    })
    .eq("id", courseId);

  if (error) {
    return fail(
      error.message || "Corso creato, ma la prova non è stata collegata.",
      { id: created.id, warnings: created.warnings },
    );
  }

  const warnings = [...(created.warnings ?? [])];
  const checkoutWarning = await lessonPackCheckoutWarning(
    client,
    created.id,
    member.id,
  );
  if (checkoutWarning) warnings.push(checkoutWarning);
  return ok(created.id, warnings);
}

async function lessonPackCheckoutWarning(
  client: TrialsClient,
  courseId: string,
  memberId: string,
): Promise<string | null> {
  let priceEur = 0;
  try {
    const course = await getCourse(client, courseId);
    priceEur = course?.priceEur ?? 0;
  } catch {
    priceEur = 0;
  }

  const { data: quotaOk } = await client.rpc("member_quota_ok", {
    p_member_id: memberId,
  });

  const needsPack = priceEur > 0;
  const needsQuota = quotaOk !== true;
  if (!needsPack && !needsQuota) return null;
  return "Apri il link di pagamento per quota e/o pacchetto da 4 lezioni.";
}

export async function listTrialCourses(
  client: TrialsClient,
  opts?: { titularMemberId?: string },
): Promise<Course[]> {
  const courses = await listCourses(client, {
    titularMemberId: opts?.titularMemberId,
  });
  return courses
    .filter((course) => course.isTrial)
    .sort((a, b) => {
      if (a.updatedAt < b.updatedAt) return 1;
      if (a.updatedAt > b.updatedAt) return -1;
      return 0;
    });
}
