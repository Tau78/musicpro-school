import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSchoolCourseTerm,
  getLessonSchoolSettings,
  listCoursePackPrices,
  listPayRateTypes,
  listSchoolClosures,
  listTeacherPayRates,
  type CourseKind,
  type IsoWeekday,
  type SchoolClosure,
  type SchoolCourseTerm,
} from "./lessons-settings";
import { notifyCourseApproved } from "./lessons-notify";
import {
  ensureOpenPackFee,
  maybeSendPackReminders,
  seedOpeningPrepaidCredits,
} from "./lessons-wallet";
import type { Database } from "./types/database";

type CoursesClient = SupabaseClient<Database>;

export type { CourseKind, IsoWeekday };

export type CourseStatus =
  | "in_attesa"
  | "attivo"
  | "rifiutato"
  | "in_pausa"
  | "chiuso";

export type LessonPlacement = "scheduled" | "da_piazzare" | "da_recuperare";

export type LessonKind = "regular" | "recupero" | "prova";

export type LessonParkedReason =
  | "giustificato"
  | "cancellata_scuola"
  | "docente_assente";

export type CourseTeacherRole = "titolare" | "coordinatore";

export type CourseDurationMinutes = 30 | 45 | 60 | 90;

export type LessonScheduleActor = {
  memberId: string;
  isStaff: boolean;
  canReschedule: boolean;
};

export type CreateCourseActor = {
  memberId: string;
  isStaff: boolean;
  canCreateCourses: boolean;
};

export type CreateCourseInput = {
  courseKind: CourseKind;
  subjectId: string;
  titularMemberId: string;
  studentMemberIds: string[];
  roomId: string | null;
  durationMinutes: CourseDurationMinutes;
  weeklyDow: IsoWeekday | number;
  weeklyStartMinute: number;
  startsOn: string;
  maxStudents?: number;
  priceEur?: number;
  openingPrepaidLessons?: number;
  /** Solo conversione prova: staff può iscrivere una bozza. */
  allowDraftEnrollment?: boolean;
};

export type ListCoursesOptions = {
  titularMemberId?: string;
  status?: CourseStatus;
  staffAll?: boolean;
};

export interface CourseMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
  warnings?: string[];
}

export interface Course {
  id: string;
  name: string;
  courseKind: CourseKind;
  status: CourseStatus;
  subjectId: string;
  titularMemberId: string;
  roomId: string | null;
  durationMinutes: number;
  weeklyDow: IsoWeekday;
  weeklyStartMinute: number;
  startsOn: string;
  termId: string;
  maxStudents: number;
  priceEur: number;
  payRateTypeId: string | null;
  payAmountEur: number | null;
  countsAsHour: boolean;
  holdUntil: string | null;
  holdBookingId: string | null;
  closedOn: string | null;
  rejectedAt: string | null;
  createdBy: string | null;
  isTrial: boolean;
  trialRescheduleUsed: boolean;
  convertedToCourseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  memberId: string;
  openingPrepaidLessons: number;
  leftAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseEnrollmentWithMember extends CourseEnrollment {
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface CourseTitular {
  memberId: string;
  firstName: string;
  lastName: string;
}

export interface CourseDetail extends Course {
  enrollments: CourseEnrollmentWithMember[];
  titular: CourseTitular | null;
  subjectName: string | null;
}

export interface CourseTeacher {
  id: string;
  courseId: string;
  memberId: string;
  role: CourseTeacherRole;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  sequenceNumber: number;
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  bookingId: string | null;
  placement: LessonPlacement;
  cancelledAt: string | null;
  kind: LessonKind;
  recoveredFromLessonId: string | null;
  makeupMemberId: string | null;
  parkedReason: LessonParkedReason | null;
  originalStartsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["course_enrollments"]["Row"];
type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  manual_tutor_email: string | null;
  is_enrollment_draft: boolean;
};

type LessonBookingRpc = {
  success?: boolean;
  booking_id?: string;
  error_code?: string;
  error_message?: string;
};

const ROME = "Europe/Rome";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_MINUTES = new Set<number>([30, 45, 60, 90]);

const COURSE_COLUMNS =
  "id, name, course_kind, status, subject_id, titular_member_id, room_id, duration_minutes, weekly_dow, weekly_start_minute, starts_on, term_id, max_students, price_eur, pay_rate_type_id, pay_amount_eur, counts_as_hour, hold_until, hold_booking_id, closed_on, rejected_at, created_by, is_trial, trial_reschedule_used, converted_to_course_id, created_at, updated_at";

const ENROLLMENT_COLUMNS =
  "id, course_id, member_id, opening_prepaid_lessons, left_at, created_at, updated_at";

const LESSON_COLUMNS =
  "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at";

function fail(errorMessage: string, extras: Partial<CourseMutationResult> = {}): CourseMutationResult {
  return { success: false, errorMessage, ...extras };
}

function ok(id?: string, warnings?: string[]): CourseMutationResult {
  const result: CourseMutationResult = { success: true };
  if (id) result.id = id;
  if (warnings && warnings.length > 0) result.warnings = warnings;
  return result;
}

function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function isCourseKind(value: string): value is CourseKind {
  return value === "individuale" || value === "gruppo" || value === "online";
}

function memberLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function mapCourse(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    courseKind: row.course_kind,
    status: row.status,
    subjectId: row.subject_id,
    titularMemberId: row.titular_member_id,
    roomId: row.room_id,
    durationMinutes: row.duration_minutes,
    weeklyDow: row.weekly_dow as IsoWeekday,
    weeklyStartMinute: row.weekly_start_minute,
    startsOn: row.starts_on,
    termId: row.term_id,
    maxStudents: row.max_students,
    priceEur: Number(row.price_eur),
    payRateTypeId: row.pay_rate_type_id,
    payAmountEur: row.pay_amount_eur == null ? null : Number(row.pay_amount_eur),
    countsAsHour: row.counts_as_hour,
    holdUntil: row.hold_until,
    holdBookingId: row.hold_booking_id,
    closedOn: row.closed_on,
    rejectedAt: row.rejected_at,
    createdBy: row.created_by,
    isTrial: row.is_trial,
    trialRescheduleUsed: row.trial_reschedule_used,
    convertedToCourseId: row.converted_to_course_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEnrollment(row: EnrollmentRow): CourseEnrollment {
  return {
    id: row.id,
    courseId: row.course_id,
    memberId: row.member_id,
    openingPrepaidLessons: row.opening_prepaid_lessons,
    leftAt: row.left_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLesson(row: LessonRow): Lesson {
  return {
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
  };
}

function todayInRome(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function isoDow(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

function firstDateOnDow(from: string, dow: number): string {
  const delta = (dow - isoDow(from) + 7) % 7;
  return addDays(from, delta);
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function romeDateTimeToUtcIso(date: string, minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(new Date(guess));
  const offsetPart =
    parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    offsetMinutes = sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  }
  return new Date(guess - offsetMinutes * 60_000).toISOString();
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function dateOverlapsClosure(date: string, closure: SchoolClosure): boolean {
  if (closure.repeatsYearly) {
    const monthDay = date.slice(5);
    const startMd = closure.startsOn.slice(5);
    const endMd = closure.endsOn.slice(5);
    if (startMd <= endMd) {
      return monthDay >= startMd && monthDay <= endMd;
    }
    return monthDay >= startMd || monthDay <= endMd;
  }
  return date >= closure.startsOn && date <= closure.endsOn;
}

function isSchoolClosed(date: string, closures: SchoolClosure[]): boolean {
  return closures.some((closure) => dateOverlapsClosure(date, closure));
}

function* weeklyDates(
  from: string,
  dow: number,
  until: string,
): Generator<string> {
  if (from > until) return;
  let cursor = firstDateOnDow(from, dow);
  while (cursor <= until) {
    yield cursor;
    cursor = addDays(cursor, 7);
  }
}

function hasContactEmail(row: StudentRow): boolean {
  return Boolean(row.email?.trim() || row.manual_tutor_email?.trim());
}

async function loadCourse(
  client: CoursesClient,
  courseId: string,
): Promise<Course | null> {
  const { data, error } = await client
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare il corso: ${error.message}`);
  }
  return data ? mapCourse(data) : null;
}

export async function cancelHoldBooking(
  client: CoursesClient,
  bookingId: string | null,
): Promise<string | null> {
  if (!bookingId) return null;

  const { data, error } = await client.rpc("cancel_lesson_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    const { error: updateError } = await client
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .neq("status", "cancelled");
    if (updateError) {
      return updateError.message || "Impossibile annullare l'hold della sala.";
    }
    return null;
  }

  const result = data as LessonBookingRpc | null;
  if (result && result.success === false && result.error_code !== "ALREADY_CANCELLED") {
    return result.error_message || "Impossibile annullare l'hold della sala.";
  }
  return null;
}

async function rejectCourseRow(
  client: CoursesClient,
  course: Course,
): Promise<string | null> {
  const cancelError = await cancelHoldBooking(client, course.holdBookingId);
  if (cancelError) return cancelError;

  const { error } = await client
    .from("courses")
    .update({
      status: "rifiutato",
      rejected_at: new Date().toISOString(),
      hold_booking_id: null,
    })
    .eq("id", course.id);

  if (error) {
    return error.message || "Impossibile rifiutare il corso.";
  }
  return null;
}

export function lessonCalendarTitle(
  studentLastName: string | null | undefined,
): string {
  const last = studentLastName?.trim();
  return last ? `Lezione: ${last}` : "Lezione";
}

export async function resolveLessonCalendarTitle(
  client: CoursesClient,
  courseId: string,
  fallbackLastName?: string | null,
): Promise<string> {
  if (fallbackLastName?.trim()) {
    return lessonCalendarTitle(fallbackLastName);
  }
  const { data: enrollment } = await client
    .from("course_enrollments")
    .select("member_id")
    .eq("course_id", courseId)
    .is("left_at", null)
    .limit(1)
    .maybeSingle();
  if (!enrollment) return "Lezione";
  const { data: member } = await client
    .from("members")
    .select("last_name")
    .eq("id", enrollment.member_id)
    .maybeSingle();
  return lessonCalendarTitle(member?.last_name);
}

export async function createLessonBooking(
  client: CoursesClient,
  params: {
    roomId: string;
    memberId: string;
    startAt: string;
    endAt: string;
    title: string;
  },
): Promise<{ bookingId?: string; errorCode?: string; errorMessage?: string }> {
  const { data, error } = await client.rpc("create_lesson_booking", {
    p_room_id: params.roomId,
    p_member_id: params.memberId,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
    p_title: params.title,
  });

  if (error) {
    const slotTaken = error.message?.includes("SLOT_TAKEN");
    return {
      errorCode: slotTaken ? "SLOT_TAKEN" : "UNKNOWN",
      errorMessage: error.message || "Impossibile occupare la sala.",
    };
  }

  const result = data as LessonBookingRpc | null;
  if (!result?.success) {
    return {
      errorCode: result?.error_code ?? "UNKNOWN",
      errorMessage:
        result?.error_message || "Impossibile occupare la sala.",
    };
  }

  return { bookingId: result.booking_id };
}

async function resolvePaySnapshot(
  client: CoursesClient,
  titularMemberId: string,
  courseKind: CourseKind,
): Promise<{ payRateTypeId: string | null; payAmountEur: number | null }> {
  const slug = courseKind === "gruppo" ? "collettivo" : "lezioni";
  const [types, rates] = await Promise.all([
    listPayRateTypes(client),
    listTeacherPayRates(client, titularMemberId),
  ]);
  const type = types.find((row) => row.slug === slug) ?? null;
  const rate = type
    ? rates.find((row) => row.payRateTypeId === type.id) ?? null
    : null;
  return {
    payRateTypeId: type?.id ?? null,
    payAmountEur: rate?.amountEur ?? null,
  };
}

function firstFutureOccurrence(
  course: Pick<
    Course,
    "startsOn" | "weeklyDow" | "weeklyStartMinute" | "durationMinutes"
  >,
  term: SchoolCourseTerm,
  closures: SchoolClosure[],
): { date: string; startAt: string; endAt: string } | null {
  const from = maxDate(course.startsOn, todayInRome());
  const now = Date.now();
  for (const date of weeklyDates(from, course.weeklyDow, term.endsOn)) {
    if (date < course.startsOn) continue;
    if (isSchoolClosed(date, closures)) continue;
    const startAt = romeDateTimeToUtcIso(date, course.weeklyStartMinute);
    if (new Date(startAt).getTime() <= now) continue;
    return {
      date,
      startAt,
      endAt: addMinutesIso(startAt, course.durationMinutes),
    };
  }
  return null;
}

export async function listCourses(
  client: CoursesClient,
  options: ListCoursesOptions = {},
): Promise<Course[]> {
  let query = client
    .from("courses")
    .select(COURSE_COLUMNS)
    .order("starts_on", { ascending: true })
    .order("name", { ascending: true });

  if (options.titularMemberId) {
    query = query.eq("titular_member_id", options.titularMemberId);
  }
  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Impossibile caricare i corsi: ${error.message}`);
  }
  return (data ?? []).map(mapCourse);
}

export async function getCourse(
  client: CoursesClient,
  id: string,
): Promise<CourseDetail | null> {
  const course = await loadCourse(client, id);
  if (!course) return null;

  const [enrollmentsRes, titularRes, subjectRes] = await Promise.all([
    client
      .from("course_enrollments")
      .select(ENROLLMENT_COLUMNS)
      .eq("course_id", id)
      .order("created_at", { ascending: true }),
    client
      .from("members")
      .select("id, first_name, last_name")
      .eq("id", course.titularMemberId)
      .maybeSingle(),
    client
      .from("lesson_subjects")
      .select("name")
      .eq("id", course.subjectId)
      .maybeSingle(),
  ]);

  if (enrollmentsRes.error) {
    throw new Error(
      `Impossibile caricare gli iscritti: ${enrollmentsRes.error.message}`,
    );
  }

  const enrollmentRows = enrollmentsRes.data ?? [];
  const memberIds = enrollmentRows.map((row) => row.member_id);
  const membersById = new Map<
    string,
    { firstName: string; lastName: string; email: string | null }
  >();

  if (memberIds.length > 0) {
    const { data: members, error: membersError } = await client
      .from("members")
      .select("id, first_name, last_name, email")
      .in("id", memberIds);

    if (membersError) {
      throw new Error(
        `Impossibile caricare gli allievi: ${membersError.message}`,
      );
    }

    for (const member of members ?? []) {
      membersById.set(member.id, {
        firstName: member.first_name,
        lastName: member.last_name,
        email: member.email,
      });
    }
  }

  const enrollments: CourseEnrollmentWithMember[] = enrollmentRows.map((row) => {
    const member = membersById.get(row.member_id);
    return {
      ...mapEnrollment(row),
      firstName: member?.firstName ?? "",
      lastName: member?.lastName ?? "",
      email: member?.email ?? null,
    };
  });

  const titular = titularRes.data
    ? {
        memberId: titularRes.data.id,
        firstName: titularRes.data.first_name,
        lastName: titularRes.data.last_name,
      }
    : null;

  return {
    ...course,
    enrollments,
    titular,
    subjectName: subjectRes.data?.name ?? null,
  };
}

export async function listPendingCourses(
  client: CoursesClient,
): Promise<Course[]> {
  const { data, error } = await client
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("status", "in_attesa")
    .order("hold_until", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare i corsi in attesa: ${error.message}`,
    );
  }
  return (data ?? []).map(mapCourse);
}

export async function listUnplacedLessons(
  client: CoursesClient,
  options: { courseId?: string; titularMemberId?: string } = {},
): Promise<Lesson[]> {
  let query = client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .in("placement", ["da_piazzare", "da_recuperare"])
    .is("cancelled_at", null)
    .order("course_id", { ascending: true })
    .order("sequence_number", { ascending: true });

  if (options.courseId) {
    query = query.eq("course_id", options.courseId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Impossibile caricare le lezioni da piazzare: ${error.message}`,
    );
  }
  const lessons = (data ?? []).map(mapLesson);
  if (!options.titularMemberId) return lessons;

  const courseIds = [...new Set(lessons.map((row) => row.courseId))];
  if (courseIds.length === 0) return lessons;
  const { data: courseRows, error: courseError } = await client
    .from("courses")
    .select("id")
    .in("id", courseIds)
    .eq("titular_member_id", options.titularMemberId);
  if (courseError) {
    throw new Error(
      `Impossibile filtrare le lezioni da piazzare: ${courseError.message}`,
    );
  }
  const allowed = new Set((courseRows ?? []).map((row) => row.id));
  return lessons.filter((row) => allowed.has(row.courseId));
}

export async function createCourse(
  client: CoursesClient,
  input: CreateCourseInput,
  actor: CreateCourseActor,
): Promise<CourseMutationResult> {
  const warnings: string[] = [];
  const studentMemberIds = [
    ...new Set(input.studentMemberIds.filter((id) => id.trim())),
  ];

  if (!isCourseKind(input.courseKind)) {
    return fail("Tipo corso non valido.");
  }
  if (!DURATION_MINUTES.has(input.durationMinutes)) {
    return fail("La durata deve essere 30, 45, 60 o 90 minuti.");
  }
  if (!isIsoWeekday(input.weeklyDow)) {
    return fail("Giorno della settimana non valido.");
  }
  if (
    !Number.isInteger(input.weeklyStartMinute) ||
    input.weeklyStartMinute < 0 ||
    input.weeklyStartMinute > 1439
  ) {
    return fail("L'orario settimanale non è valido.");
  }
  if (!ISO_DATE_RE.test(input.startsOn)) {
    return fail("La data di inizio non è valida.");
  }
  if (studentMemberIds.length < 1) {
    return fail("Serve almeno un allievo.");
  }

  if (input.courseKind === "online") {
    if (input.roomId) {
      return fail("Un corso online non può avere una sala.");
    }
  } else if (!input.roomId) {
    return fail("La sala è obbligatoria per i corsi in presenza.");
  }

  if (!actor.isStaff) {
    if (!actor.canCreateCourses) {
      return fail("Non hai il permesso di creare corsi.");
    }
    if (input.titularMemberId !== actor.memberId) {
      return fail("Puoi creare corsi solo come titolare.");
    }
  }

  const term = await getCurrentSchoolCourseTerm(client);
  if (!term) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }
  if (input.startsOn < term.startsOn || input.startsOn > term.endsOn) {
    return fail("La data di inizio deve essere nell'anno corsi.");
  }

  const [settings, packPrices, subjectRes, studentsRes] = await Promise.all([
    getLessonSchoolSettings(client),
    listCoursePackPrices(client),
    client
      .from("lesson_subjects")
      .select("id, name")
      .eq("id", input.subjectId)
      .maybeSingle(),
    client
      .from("members")
      .select(
        "id, first_name, last_name, email, manual_tutor_email, is_enrollment_draft",
      )
      .in("id", studentMemberIds),
  ]);

  if (subjectRes.error) {
    return fail(subjectRes.error.message || "Impossibile caricare la materia.");
  }
  if (!subjectRes.data) {
    return fail("Materia non trovata.");
  }
  if (studentsRes.error) {
    return fail(studentsRes.error.message || "Impossibile caricare gli allievi.");
  }

  const students = (studentsRes.data ?? []) as StudentRow[];
  if (students.length !== studentMemberIds.length) {
    return fail("Uno o più allievi non sono stati trovati.");
  }

  const defaultCapacity = settings?.defaultGroupCapacity ?? 8;
  const maxStudents =
    input.courseKind === "gruppo"
      ? (input.maxStudents ?? defaultCapacity)
      : 1;
  if (!Number.isInteger(maxStudents) || maxStudents < 1) {
    return fail("La capienza del corso non è valida.");
  }
  if (studentMemberIds.length > maxStudents) {
    return fail("Troppi allievi rispetto alla capienza del corso.");
  }

  for (const student of students) {
    if (!hasContactEmail(student)) {
      return fail(
        `Manca l'email per ${memberLabel(student.last_name, student.first_name)} (allievo o tutore).`,
      );
    }
    if (student.is_enrollment_draft) {
      if (input.allowDraftEnrollment && actor.isStaff) {
        warnings.push(
          `Iscrizione in bozza per ${memberLabel(student.last_name, student.first_name)}: completa il modulo di iscrizione.`,
        );
      } else {
        return fail(
          `Non si può iscrivere una bozza anagrafica (${memberLabel(student.last_name, student.first_name)}) a un corso.`,
        );
      }
    }
  }

  const quotaResults = await Promise.all(
    students.map(async (student) => {
      const { data, error } = await client.rpc("member_quota_ok", {
        p_member_id: student.id,
      });
      return { student, ok: Boolean(data), error };
    }),
  );
  for (const row of quotaResults) {
    if (row.error || !row.ok) {
      const label = memberLabel(row.student.last_name, row.student.first_name);
      if (!actor.isStaff) {
        return fail(
          `Quota associativa mancante per ${label}. Chiedi alla segreteria.`,
        );
      }
      warnings.push(`Quota associativa mancante per ${label}.`);
    }
  }

  const pack = packPrices.find(
    (row) =>
      row.courseKind === input.courseKind &&
      row.durationMinutes === input.durationMinutes,
  );
  const priceEur =
    input.priceEur != null
      ? input.priceEur
      : pack?.amountEur != null
        ? pack.amountEur
        : 0;
  if (!Number.isFinite(priceEur) || priceEur < 0) {
    return fail("Il prezzo del corso non è valido.");
  }

  const openingPrepaidLessons = input.openingPrepaidLessons ?? 0;
  if (
    !Number.isInteger(openingPrepaidLessons) ||
    openingPrepaidLessons < 0
  ) {
    return fail("Il saldo iniziale lezioni non è valido.");
  }

  const firstStudent = students[0];
  const name =
    input.courseKind === "gruppo"
      ? `Gruppo ${subjectRes.data.name}`
      : `${subjectRes.data.name} — ${memberLabel(firstStudent.last_name, firstStudent.first_name)}`;

  const pay = await resolvePaySnapshot(
    client,
    input.titularMemberId,
    input.courseKind,
  );

  const isStaff = actor.isStaff;
  const holdUntil = isStaff
    ? null
    : new Date(
        Date.now() + (settings?.holdHours ?? 48) * 60 * 60 * 1000,
      ).toISOString();

  const { data: inserted, error: insertError } = await client
    .from("courses")
    .insert({
      name,
      course_kind: input.courseKind,
      status: isStaff ? "attivo" : "in_attesa",
      subject_id: input.subjectId,
      titular_member_id: input.titularMemberId,
      room_id: input.courseKind === "online" ? null : input.roomId,
      duration_minutes: input.durationMinutes,
      weekly_dow: input.weeklyDow,
      weekly_start_minute: input.weeklyStartMinute,
      starts_on: input.startsOn,
      term_id: term.id,
      max_students: maxStudents,
      price_eur: priceEur,
      pay_rate_type_id: pay.payRateTypeId,
      pay_amount_eur: pay.payAmountEur,
      hold_until: holdUntil,
      created_by: actor.memberId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return fail(insertError?.message || "Impossibile creare il corso.");
  }

  const courseId = inserted.id;

  const { error: teacherError } = await client.from("course_teachers").insert({
    course_id: courseId,
    member_id: input.titularMemberId,
    role: "titolare",
    starts_on: input.startsOn,
  });
  if (teacherError) {
    await client.from("courses").delete().eq("id", courseId);
    return fail(teacherError.message || "Impossibile assegnare il titolare.");
  }

  const { data: insertedEnrollments, error: enrollmentError } = await client
    .from("course_enrollments")
    .insert(
      studentMemberIds.map((memberId) => ({
        course_id: courseId,
        member_id: memberId,
        opening_prepaid_lessons: openingPrepaidLessons,
      })),
    )
    .select("id, opening_prepaid_lessons");
  if (enrollmentError) {
    await client.from("courses").delete().eq("id", courseId);
    return fail(
      enrollmentError.message || "Impossibile iscrivere gli allievi.",
    );
  }

  for (const enrollment of insertedEnrollments ?? []) {
    if (enrollment.opening_prepaid_lessons > 0) {
      const seeded = await seedOpeningPrepaidCredits(client, {
        enrollmentId: enrollment.id,
        lessons: enrollment.opening_prepaid_lessons,
        note: "Saldo iniziale",
        actorMemberId: actor.memberId,
      });
      if (!seeded.success && seeded.errorMessage) {
        warnings.push(seeded.errorMessage);
      }
      if (seeded.warnings) warnings.push(...seeded.warnings);
    }
  }

  if (isStaff) {
    for (const enrollment of insertedEnrollments ?? []) {
      const fee = await ensureOpenPackFee(client, enrollment.id);
      if (!fee.success && fee.errorMessage) {
        warnings.push(fee.errorMessage);
      }
      if (fee.warnings) warnings.push(...fee.warnings);
    }
  }

  if (input.roomId) {
    const { data: duplicates, error: dupError } = await client
      .from("courses")
      .select("id")
      .eq("status", "in_attesa")
      .eq("room_id", input.roomId)
      .eq("weekly_dow", input.weeklyDow)
      .eq("weekly_start_minute", input.weeklyStartMinute)
      .neq("id", courseId)
      .limit(1);
    if (!dupError && (duplicates?.length ?? 0) > 0) {
      warnings.push(
        "C'è già un corso in attesa nello stesso slot (stessa sala, giorno e orario).",
      );
    }
  }

  if (!isStaff && input.roomId) {
    const closures = await listSchoolClosures(client);
    const occurrence = firstFutureOccurrence(
      {
        startsOn: input.startsOn,
        weeklyDow: input.weeklyDow,
        weeklyStartMinute: input.weeklyStartMinute,
        durationMinutes: input.durationMinutes,
      },
      term,
      closures,
    );
    if (occurrence) {
      const booked = await createLessonBooking(client, {
        roomId: input.roomId,
        memberId: input.titularMemberId,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        title: await resolveLessonCalendarTitle(client, courseId),
      });
      if (booked.bookingId) {
        const { error: holdError } = await client
          .from("courses")
          .update({ hold_booking_id: booked.bookingId })
          .eq("id", courseId);
        if (holdError) {
          warnings.push("Corso creato, ma l'hold sala non è stato salvato.");
        }
      } else if (booked.errorCode === "SLOT_TAKEN") {
        warnings.push(
          "Lo slot è già occupato: l'hold della sala non è stato creato.",
        );
      } else {
        warnings.push(
          booked.errorMessage ||
            "Non è stato possibile occupare la sala per l'hold.",
        );
      }
    }
  }

  if (isStaff) {
    const generated = await generateCourseLessons(client, courseId);
    if (!generated.success) {
      return fail(
        generated.errorMessage || "Impossibile generare le lezioni.",
        { id: courseId, warnings },
      );
    }
    if (generated.warnings) warnings.push(...generated.warnings);
  }

  return ok(courseId, warnings);
}

export async function expireDueHolds(
  client: CoursesClient,
): Promise<CourseMutationResult> {
  const { data, error } = await client
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("status", "in_attesa")
    .lt("hold_until", new Date().toISOString());

  if (error) {
    return fail(error.message || "Impossibile scansionare gli hold scaduti.");
  }

  const warnings: string[] = [];
  for (const row of data ?? []) {
    const rejectError = await rejectCourseRow(client, mapCourse(row));
    if (rejectError) {
      warnings.push(`${row.name}: ${rejectError}`);
    }
  }

  return ok(undefined, warnings);
}

export async function approveCourse(
  client: CoursesClient,
  courseId: string,
  _actorMemberId: string,
  slot?: {
    roomId?: string | null;
    weeklyDow?: IsoWeekday | number;
    weeklyStartMinute?: number;
  },
): Promise<CourseMutationResult> {
  const expired = await expireDueHolds(client);
  if (!expired.success) return expired;

  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.status !== "in_attesa") {
    return fail("Il corso non è in attesa di approvazione.");
  }
  if (course.holdUntil && course.holdUntil < new Date().toISOString()) {
    return fail("L'hold della sala è scaduto.", { warnings: expired.warnings });
  }

  const nextRoomId =
    slot && "roomId" in slot
      ? course.courseKind === "online"
        ? null
        : (slot.roomId ?? course.roomId)
      : course.roomId;
  const nextDow =
    slot?.weeklyDow != null ? slot.weeklyDow : course.weeklyDow;
  const nextStart =
    slot?.weeklyStartMinute != null
      ? slot.weeklyStartMinute
      : course.weeklyStartMinute;

  if (!isIsoWeekday(nextDow)) {
    return fail("Giorno della settimana non valido.");
  }
  if (
    !Number.isInteger(nextStart) ||
    nextStart < 0 ||
    nextStart > 1439
  ) {
    return fail("L'orario settimanale non è valido.");
  }
  if (course.courseKind !== "online" && !nextRoomId) {
    return fail("La sala è obbligatoria per i corsi in presenza.");
  }

  const packPrices = await listCoursePackPrices(client);
  const pack = packPrices.find(
    (row) =>
      row.courseKind === course.courseKind &&
      row.durationMinutes === course.durationMinutes,
  );
  if (!pack) {
    return fail("Manca la riga listino per questo tipo e durata.");
  }

  const cancelError = await cancelHoldBooking(client, course.holdBookingId);
  if (cancelError) return fail(cancelError);

  const { error: updateError } = await client
    .from("courses")
    .update({
      status: "attivo",
      hold_until: null,
      hold_booking_id: null,
      room_id: nextRoomId,
      weekly_dow: nextDow,
      weekly_start_minute: nextStart,
    })
    .eq("id", courseId);

  if (updateError) {
    return fail(updateError.message || "Impossibile approvare il corso.");
  }

  const generated = await generateCourseLessons(client, courseId);
  if (!generated.success) {
    return fail(
      generated.errorMessage || "Corso approvato, ma le lezioni non sono state generate.",
      { id: courseId, warnings: expired.warnings },
    );
  }

  const warnings = [
    ...(expired.warnings ?? []),
    ...(generated.warnings ?? []),
  ];

  const { data: enrollmentRows, error: enrollmentsError } = await client
    .from("course_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .is("left_at", null);
  if (enrollmentsError) {
    warnings.push(
      enrollmentsError.message || "Impossibile aprire le rette del corso.",
    );
  } else {
    for (const row of enrollmentRows ?? []) {
      const fee = await ensureOpenPackFee(client, row.id);
      if (!fee.success && fee.errorMessage) {
        warnings.push(fee.errorMessage);
      }
      if (fee.warnings) warnings.push(...fee.warnings);
    }
  }

  void notifyCourseApproved(client, { courseId }).catch(() => undefined);

  return ok(courseId, warnings);
}

export async function rejectCourse(
  client: CoursesClient,
  courseId: string,
  _actorMemberId: string,
): Promise<CourseMutationResult> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.status !== "in_attesa") {
    return fail("Si può rifiutare solo un corso in attesa.");
  }

  const rejectError = await rejectCourseRow(client, course);
  if (rejectError) return fail(rejectError);
  return ok(courseId);
}

export async function extendCourseHold(
  client: CoursesClient,
  courseId: string,
  extraHours: number,
): Promise<CourseMutationResult> {
  if (!Number.isFinite(extraHours) || extraHours <= 0) {
    return fail("Le ore di prolungamento non sono valide.");
  }

  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.status !== "in_attesa") {
    return fail("Si può prolungare l'hold solo su un corso in attesa.");
  }

  const baseMs = course.holdUntil
    ? new Date(course.holdUntil).getTime()
    : Date.now();
  if (!Number.isFinite(baseMs)) {
    return fail("La scadenza hold attuale non è valida.");
  }

  const { error } = await client
    .from("courses")
    .update({
      hold_until: new Date(baseMs + extraHours * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", courseId);

  if (error) {
    return fail(error.message || "Impossibile prolungare l'hold.");
  }
  return ok(courseId);
}

export async function generateCourseLessons(
  client: CoursesClient,
  courseId: string,
): Promise<CourseMutationResult> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.status !== "attivo") {
    return fail("Si possono generare lezioni solo per un corso attivo.");
  }

  const { data: existing, error: existingError } = await client
    .from("lessons")
    .select("id")
    .eq("course_id", courseId)
    .limit(1);
  if (existingError) {
    return fail(
      existingError.message || "Impossibile verificare le lezioni esistenti.",
    );
  }
  if ((existing?.length ?? 0) > 0) {
    return ok(courseId);
  }

  const { data: termRow, error: termError } = await client
    .from("school_course_terms")
    .select("id, label, starts_on, ends_on, is_current, created_at, updated_at")
    .eq("id", course.termId)
    .maybeSingle();
  if (termError) {
    return fail(termError.message || "Impossibile caricare l'anno corsi.");
  }
  if (!termRow) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }

  const term: SchoolCourseTerm = {
    id: termRow.id,
    label: termRow.label,
    startsOn: termRow.starts_on,
    endsOn: termRow.ends_on,
    isCurrent: termRow.is_current,
    createdAt: termRow.created_at,
    updatedAt: termRow.updated_at,
  };
  const closures = await listSchoolClosures(client);
  const from = maxDate(course.startsOn, term.startsOn);
  const title = await resolveLessonCalendarTitle(client, courseId);
  const warnings: string[] = [];
  const rows: Database["public"]["Tables"]["lessons"]["Insert"][] = [];
  let sequence = 1;

  const regularDates: string[] = [];
  let holidayCount = 0;
  for (const date of weeklyDates(from, course.weeklyDow, term.endsOn)) {
    if (date < course.startsOn) continue;
    if (isSchoolClosed(date, closures)) holidayCount += 1;
    else regularDates.push(date);
  }

  const datesToPlace = [...regularDates];
  let searchFrom = addDays(term.endsOn, 1);
  for (let i = 0; i < holidayCount; i += 1) {
    let cursor = firstDateOnDow(searchFrom, course.weeklyDow);
    let found: string | null = null;
    for (let week = 0; week < 12; week += 1) {
      if (!isSchoolClosed(cursor, closures)) {
        found = cursor;
        break;
      }
      cursor = addDays(cursor, 7);
    }
    if (found) {
      datesToPlace.push(found);
      searchFrom = addDays(found, 1);
    } else {
      rows.push({
        course_id: courseId,
        sequence_number: sequence,
        starts_at: null,
        ends_at: null,
        room_id: course.roomId,
        booking_id: null,
        placement: "da_piazzare",
      });
      sequence += 1;
    }
  }

  for (const date of datesToPlace) {

    const startAt = romeDateTimeToUtcIso(date, course.weeklyStartMinute);
    const endAt = addMinutesIso(startAt, course.durationMinutes);

    if (!course.roomId) {
      rows.push({
        course_id: courseId,
        sequence_number: sequence,
        starts_at: startAt,
        ends_at: endAt,
        room_id: null,
        booking_id: null,
        placement: "scheduled",
      });
      sequence += 1;
      continue;
    }

    const booked = await createLessonBooking(client, {
      roomId: course.roomId,
      memberId: course.titularMemberId,
      startAt,
      endAt,
      title,
    });

    if (booked.bookingId) {
      rows.push({
        course_id: courseId,
        sequence_number: sequence,
        starts_at: startAt,
        ends_at: endAt,
        room_id: course.roomId,
        booking_id: booked.bookingId,
        placement: "scheduled",
      });
    } else {
      if (booked.errorCode !== "SLOT_TAKEN" && booked.errorMessage) {
        warnings.push(`Lezione #${sequence}: ${booked.errorMessage}`);
      }
      rows.push({
        course_id: courseId,
        sequence_number: sequence,
        starts_at: null,
        ends_at: null,
        room_id: course.roomId,
        booking_id: null,
        placement: "da_piazzare",
      });
    }
    sequence += 1;
  }

  if (rows.length === 0) {
    return fail(
      "Nessuna lezione da generare nell'anno corsi.",
      { id: courseId },
    );
  }

  const { error: insertError } = await client.from("lessons").insert(rows);
  if (insertError) {
    return fail(
      insertError.message || "Impossibile salvare le lezioni generate.",
      { id: courseId, warnings },
    );
  }

  try {
    await maybeSendPackReminders(client, courseId);
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? err.message
        : "Impossibile valutare i solleciti pacchetto.",
    );
  }

  return ok(courseId, warnings);
}

export async function placeLesson(
  client: CoursesClient,
  lessonId: string,
  input: {
    startsAt: string;
    roomId: string | null;
    actor: LessonScheduleActor;
  },
): Promise<CourseMutationResult> {
  const startsMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startsMs)) {
    return fail("Data e ora della lezione non valide.");
  }

  const { data: lessonRow, error: lessonError } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) {
    return fail(lessonError.message || "Impossibile caricare la lezione.");
  }
  if (!lessonRow) {
    return fail("Lezione non trovata.");
  }

  const lesson = mapLesson(lessonRow);
  if (lesson.cancelledAt) {
    return fail("La lezione è stata annullata.");
  }
  if (lesson.placement !== "da_piazzare" && lesson.placement !== "da_recuperare") {
    return fail("La lezione è già piazzata.");
  }

  const course = await loadCourse(client, lesson.courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (!input.actor.isStaff) {
    if (course.titularMemberId !== input.actor.memberId) {
      return fail("Puoi piazzare solo le lezioni dei tuoi corsi.");
    }
    if (!input.actor.canReschedule) {
      return fail("Non hai il permesso di piazzare o recuperare lezioni.");
    }
  }

  const roomId = course.courseKind === "online" ? null : input.roomId;
  if (course.courseKind !== "online" && !roomId) {
    return fail("La sala è obbligatoria per i corsi in presenza.");
  }

  const startsAt = new Date(startsMs).toISOString();
  if (lesson.placement === "da_recuperare" && dateInRome(startsAt) < todayInRome()) {
    return fail("Non si piazza un recupero nel passato.");
  }
  const endsAt = addMinutesIso(startsAt, course.durationMinutes);
  let bookingId: string | null = null;

  if (roomId) {
    const booked = await createLessonBooking(client, {
      roomId,
      memberId: course.titularMemberId,
      startAt: startsAt,
      endAt: endsAt,
      title: await resolveLessonCalendarTitle(client, course.id),
    });
    if (!booked.bookingId) {
      return fail(
        booked.errorCode === "SLOT_TAKEN"
          ? "Lo slot è già occupato."
          : booked.errorMessage || "Impossibile occupare la sala.",
      );
    }
    bookingId = booked.bookingId;
  }

  const { error } = await client
    .from("lessons")
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
      room_id: roomId,
      booking_id: bookingId,
      placement: "scheduled",
    })
    .eq("id", lessonId);

  if (error) {
    return fail(error.message || "Impossibile piazzare la lezione.");
  }
  return ok(lessonId);
}

export async function transferCourseTitular(
  client: CoursesClient,
  courseId: string,
  newTitularMemberId: string,
  actor: { memberId: string; isStaff: boolean },
): Promise<CourseMutationResult> {
  if (!actor.isStaff) {
    return fail("Solo lo staff può cambiare il titolare.");
  }

  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.status !== "attivo" && course.status !== "in_pausa") {
    return fail("Si può cambiare il titolare solo su un corso attivo o in pausa.");
  }
  if (course.titularMemberId === newTitularMemberId) {
    return fail("Il docente è già titolare di questo corso.");
  }

  const { data: roleRow, error: roleError } = await client
    .from("member_roles")
    .select("id")
    .eq("member_id", newTitularMemberId)
    .eq("role", "docente")
    .is("revoked_at", null)
    .maybeSingle();
  if (roleError) {
    return fail(roleError.message || "Impossibile verificare il ruolo docente.");
  }
  if (!roleRow) {
    return fail("Il nuovo titolare deve avere il ruolo docente.");
  }

  const today = todayInRome();
  const { data: currentTitular, error: currentError } = await client
    .from("course_teachers")
    .select("id, starts_on")
    .eq("course_id", courseId)
    .eq("role", "titolare")
    .is("ends_on", null)
    .maybeSingle();
  if (currentError) {
    return fail(
      currentError.message || "Impossibile caricare il titolare attuale.",
    );
  }

  if (currentTitular) {
    const endsOn =
      currentTitular.starts_on > today ? currentTitular.starts_on : today;
    const { error: closeError } = await client
      .from("course_teachers")
      .update({ ends_on: endsOn })
      .eq("id", currentTitular.id);
    if (closeError) {
      return fail(closeError.message || "Impossibile chiudere il titolare attuale.");
    }
  }

  const { error: insertError } = await client.from("course_teachers").insert({
    course_id: courseId,
    member_id: newTitularMemberId,
    role: "titolare",
    starts_on: today,
  });
  if (insertError) {
    return fail(insertError.message || "Impossibile assegnare il nuovo titolare.");
  }

  const { error: updateError } = await client
    .from("courses")
    .update({ titular_member_id: newTitularMemberId })
    .eq("id", courseId);
  if (updateError) {
    return fail(updateError.message || "Impossibile aggiornare il titolare del corso.");
  }

  return ok(courseId);
}
