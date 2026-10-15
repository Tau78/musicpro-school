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
import {
  notifyCourseApproved,
  notifyCourseCreatedActive,
} from "./lessons-notify";
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
  /** Staff (admin/segreteria): iscrive anche con anagrafica incompleta (warning). */
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
  /** Iscrizioni per cui è stata aperta una retta pacchetto (sync wallet). */
  packOpenedEnrollmentIds?: string[];
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
  tax_code: string | null;
};

/** Bozza o senza CF: non iscrivibile (la sola quota non basta). */
function isStudentEnrollmentIncomplete(student: StudentRow): boolean {
  if (student.is_enrollment_draft) return true;
  return !String(student.tax_code || "").trim();
}

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
  const courseIds = [...new Set(lessons.map((row) => row.courseId))];
  if (courseIds.length === 0) return lessons;
  const { data: courseRows, error: courseError } = await client
    .from("courses")
    .select("id, status, titular_member_id")
    .in("id", courseIds)
    .eq("status", "attivo");
  if (courseError) {
    throw new Error(
      `Impossibile filtrare le lezioni da piazzare: ${courseError.message}`,
    );
  }
  const allowed = new Set(
    (courseRows ?? [])
      .filter((row) =>
        options.titularMemberId
          ? row.titular_member_id === options.titularMemberId
          : true,
      )
      .map((row) => row.id),
  );
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
        "id, first_name, last_name, email, manual_tutor_email, is_enrollment_draft, tax_code",
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
    if (isStudentEnrollmentIncomplete(student)) {
      const label = memberLabel(student.last_name, student.first_name);
      // Staff può forzare (allowDraftEnrollment) con warning; docente/altri bloccati.
      if (input.allowDraftEnrollment && actor.isStaff) {
        warnings.push(
          `Iscrizione incompleta per ${label}: completa il modulo (CF e firma) prima del corso regolare.`,
        );
      } else {
        return fail(
          `Non si può iscrivere un allievo con iscrizione incompleta (${label}): serve modulo firmato (CF), non basta la quota.`,
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

  const { error: tutorError } = await client.rpc(
    "assign_default_tutor_on_course",
    { p_course_id: courseId },
  );
  if (tutorError) {
    warnings.push(
      tutorError.message || "Corso creato, ma il tutore non è stato assegnato.",
    );
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
      await client.from("courses").delete().eq("id", courseId);
      return fail(
        generated.errorMessage || "Impossibile generare le lezioni.",
        { warnings },
      );
    }
    if (generated.warnings) warnings.push(...generated.warnings);
    void notifyCourseCreatedActive(client, { courseId }).catch(() => undefined);
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
    // Evita corso «attivo» senza lezioni: rollback a in_attesa.
    const rollbackWarnings = [...(expired.warnings ?? [])];
    const settings = await getLessonSchoolSettings(client);
    const holdUntil = new Date(
      Date.now() + (settings?.holdHours ?? 48) * 60 * 60 * 1000,
    ).toISOString();
    let restoredHoldId: string | null = null;
    if (course.courseKind !== "online" && nextRoomId) {
      const term = await getCurrentSchoolCourseTerm(client);
      const closures = await listSchoolClosures(client);
      if (term) {
        const occurrence = firstFutureOccurrence(
          {
            startsOn: course.startsOn,
            weeklyDow: nextDow,
            weeklyStartMinute: nextStart,
            durationMinutes: course.durationMinutes,
          },
          term,
          closures,
        );
        if (occurrence) {
          const rebooked = await createLessonBooking(client, {
            roomId: nextRoomId,
            memberId: course.titularMemberId,
            startAt: occurrence.startAt,
            endAt: occurrence.endAt,
            title: await resolveLessonCalendarTitle(client, courseId),
          });
          if (rebooked.bookingId) {
            restoredHoldId = rebooked.bookingId;
          } else {
            rollbackWarnings.push(
              rebooked.errorMessage ||
                "Hold sala non ripristinato: riprenota lo slot prima di riapprovare.",
            );
          }
        }
      }
    }
    const { error: rollbackError } = await client
      .from("courses")
      .update({
        status: "in_attesa",
        hold_until: holdUntil,
        hold_booking_id: restoredHoldId,
        room_id: nextRoomId,
        weekly_dow: nextDow,
        weekly_start_minute: nextStart,
      })
      .eq("id", courseId);
    if (rollbackError) {
      rollbackWarnings.push(
        rollbackError.message ||
          "Rollback stato corso fallito: corso può risultare attivo senza lezioni.",
      );
    }
    return fail(
      generated.errorMessage ||
        "Impossibile generare le lezioni: corso non attivato.",
      { warnings: rollbackWarnings },
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

export type CourseLessonPlanEntryKind =
  | "regular"
  | "holiday_makeup"
  | "manual_holiday";

export type CourseLessonPlanEntry = {
  date: string;
  startsAt: string;
  endsAt: string;
  kind: CourseLessonPlanEntryKind;
  /** Data settimanale saltata perché festivo/chiusura. */
  replacedHolidayDate?: string;
};

export type CourseLessonPlanDraft = {
  entries: CourseLessonPlanEntry[];
  /** Recuperi non piazzabili automaticamente (da_piazzare). */
  unplacedMakeupCount: number;
  skippedHolidayDates: string[];
};

export type CourseSchedulePreviewRow = {
  rowKey: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  placement: LessonPlacement;
  kind: CourseLessonPlanEntryKind;
  replacedHolidayDate?: string;
  included: boolean;
};

export type CourseSchedulePreview = {
  rows: CourseSchedulePreviewRow[];
  skippedHolidays: string[];
  lockedLessonCount: number;
  warnings: string[];
};

export type ApplyCourseScheduleRow = {
  rowKey: string;
  date: string;
  included: boolean;
  kind: CourseLessonPlanEntryKind;
  replacedHolidayDate?: string;
};

function buildCourseLessonSchedulePlan(
  params: {
    startsOn: string;
    weeklyDow: IsoWeekday;
    weeklyStartMinute: number;
    durationMinutes: number;
  },
  term: SchoolCourseTerm,
  closures: SchoolClosure[],
  options: { planFrom: string },
): CourseLessonPlanDraft {
  const from = maxDate(maxDate(params.startsOn, term.startsOn), options.planFrom);
  const regularDates: string[] = [];
  const skippedHolidayDates: string[] = [];
  let holidayCount = 0;

  for (const date of weeklyDates(from, params.weeklyDow, term.endsOn)) {
    if (date < params.startsOn) continue;
    if (isSchoolClosed(date, closures)) {
      holidayCount += 1;
      skippedHolidayDates.push(date);
    } else {
      regularDates.push(date);
    }
  }

  const entries: CourseLessonPlanEntry[] = regularDates.map((date) => {
    const startsAt = romeDateTimeToUtcIso(date, params.weeklyStartMinute);
    return {
      date,
      startsAt,
      endsAt: addMinutesIso(startsAt, params.durationMinutes),
      kind: "regular",
    };
  });

  let searchFrom = addDays(term.endsOn, 1);
  let unplacedMakeupCount = 0;
  for (let i = 0; i < holidayCount; i += 1) {
    let cursor = firstDateOnDow(searchFrom, params.weeklyDow);
    let found: string | null = null;
    for (let week = 0; week < 12; week += 1) {
      if (!isSchoolClosed(cursor, closures)) {
        found = cursor;
        break;
      }
      cursor = addDays(cursor, 7);
    }
    if (found) {
      const startsAt = romeDateTimeToUtcIso(found, params.weeklyStartMinute);
      entries.push({
        date: found,
        startsAt,
        endsAt: addMinutesIso(startsAt, params.durationMinutes),
        kind: "holiday_makeup",
        replacedHolidayDate: skippedHolidayDates[i],
      });
      searchFrom = addDays(found, 1);
    } else {
      unplacedMakeupCount += 1;
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { entries, unplacedMakeupCount, skippedHolidayDates };
}

function planEntryRowKey(entry: Pick<CourseLessonPlanEntry, "date" | "kind">): string {
  return `${entry.kind}:${entry.date}`;
}

async function loadCourseTerm(
  client: CoursesClient,
  termId: string,
): Promise<SchoolCourseTerm | null> {
  const { data: termRow, error: termError } = await client
    .from("school_course_terms")
    .select("id, label, starts_on, ends_on, is_current, created_at, updated_at")
    .eq("id", termId)
    .maybeSingle();
  if (termError || !termRow) return null;
  return {
    id: termRow.id,
    label: termRow.label,
    startsOn: termRow.starts_on,
    endsOn: termRow.ends_on,
    isCurrent: termRow.is_current,
    createdAt: termRow.created_at,
    updatedAt: termRow.updated_at,
  };
}

function mergedScheduleParams(
  course: Course,
  patch: PatchCourseInput,
): {
  startsOn: string;
  weeklyDow: IsoWeekday;
  weeklyStartMinute: number;
  durationMinutes: number;
  roomId: string | null;
} {
  return {
    startsOn: patch.startsOn ?? course.startsOn,
    weeklyDow: (patch.weeklyDow ?? course.weeklyDow) as IsoWeekday,
    weeklyStartMinute: patch.weeklyStartMinute ?? course.weeklyStartMinute,
    durationMinutes: patch.durationMinutes ?? course.durationMinutes,
    roomId:
      patch.roomId !== undefined ? patch.roomId : course.roomId,
  };
}

async function loadLockedLessonIds(
  client: CoursesClient,
  courseId: string,
): Promise<Set<string> | { errorMessage: string }> {
  const today = todayInRome();
  const { data: lessons, error } = await client
    .from("lessons")
    .select("id, starts_at, placement")
    .eq("course_id", courseId)
    .is("cancelled_at", null);
  if (error) {
    return {
      errorMessage: error.message || "Impossibile caricare le lezioni.",
    };
  }
  const lessonIds = (lessons ?? []).map((row) => row.id);
  if (lessonIds.length === 0) return new Set<string>();

  const [consumoRes, attendanceRes] = await Promise.all([
    client
      .from("lesson_credit_ledger")
      .select("lesson_id")
      .in("lesson_id", lessonIds)
      .eq("kind", "consumo"),
    client.from("lesson_attendances").select("lesson_id").in("lesson_id", lessonIds),
  ]);
  if (consumoRes.error || attendanceRes.error) {
    return {
      errorMessage:
        consumoRes.error?.message ||
        attendanceRes.error?.message ||
        "Impossibile verificare le lezioni bloccate.",
    };
  }

  const locked = new Set<string>();
  const consumo = new Set(
    (consumoRes.data ?? [])
      .map((row) => row.lesson_id)
      .filter((id): id is string => Boolean(id)),
  );
  const attended = new Set((attendanceRes.data ?? []).map((row) => row.lesson_id));

  for (const lesson of lessons ?? []) {
    if (consumo.has(lesson.id) || attended.has(lesson.id)) {
      locked.add(lesson.id);
      continue;
    }
    if (lesson.starts_at && dateInRome(lesson.starts_at) < today) {
      locked.add(lesson.id);
    }
  }
  return locked;
}

async function insertPlannedLessonRows(
  client: CoursesClient,
  course: Course,
  entries: CourseLessonPlanEntry[],
  sequenceStart: number,
): Promise<{ warnings: string[] } | { errorMessage: string }> {
  const title = await resolveLessonCalendarTitle(client, course.id);
  const warnings: string[] = [];
  const rows: Database["public"]["Tables"]["lessons"]["Insert"][] = [];
  let sequence = sequenceStart;

  for (const entry of entries) {
    if (!course.roomId) {
      rows.push({
        course_id: course.id,
        sequence_number: sequence,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
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
      startAt: entry.startsAt,
      endAt: entry.endsAt,
      title,
    });

    if (booked.bookingId) {
      rows.push({
        course_id: course.id,
        sequence_number: sequence,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
        room_id: course.roomId,
        booking_id: booked.bookingId,
        placement: "scheduled",
      });
    } else {
      if (booked.errorCode === "SLOT_TAKEN") {
        warnings.push(
          `Lezione ${entry.date}: sala occupata — compare in calendario come da piazzare.`,
        );
      } else if (booked.errorMessage) {
        warnings.push(`Lezione ${entry.date}: ${booked.errorMessage}`);
      }
      rows.push({
        course_id: course.id,
        sequence_number: sequence,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
        room_id: course.roomId,
        booking_id: null,
        placement: "da_piazzare",
      });
    }
    sequence += 1;
  }

  if (rows.length === 0) {
    return { warnings };
  }

  const { error: insertError } = await client.from("lessons").insert(rows);
  if (insertError) {
    for (const row of rows) {
      if (row.booking_id) {
        await cancelHoldBooking(client, row.booking_id);
      }
    }
    return {
      errorMessage:
        insertError.message || "Impossibile salvare le lezioni programmate.",
    };
  }

  return { warnings };
}

async function cancelReplaceableFutureLessons(
  client: CoursesClient,
  courseId: string,
  locked: Set<string>,
): Promise<{ errorMessage?: string }> {
  const today = todayInRome();
  const { data: lessons, error } = await client
    .from("lessons")
    .select("id, starts_at, booking_id, placement")
    .eq("course_id", courseId)
    .is("cancelled_at", null);
  if (error) {
    return { errorMessage: error.message || "Impossibile caricare le lezioni." };
  }

  const nowIso = new Date().toISOString();
  for (const lesson of lessons ?? []) {
    if (locked.has(lesson.id)) continue;
    const isFuture =
      !lesson.starts_at ||
      dateInRome(lesson.starts_at) >= today ||
      lesson.placement === "da_piazzare" ||
      lesson.placement === "da_recuperare";
    if (!isFuture) continue;

    if (lesson.booking_id) {
      const cancelError = await cancelHoldBooking(client, lesson.booking_id);
      if (cancelError) return { errorMessage: cancelError };
    }
    const { error: updateError } = await client
      .from("lessons")
      .update({ cancelled_at: nowIso, booking_id: null })
      .eq("id", lesson.id);
    if (updateError) {
      return {
        errorMessage: updateError.message || "Impossibile cancellare una lezione.",
      };
    }
  }
  return {};
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
    .is("cancelled_at", null)
    .limit(1);
  if (existingError) {
    return fail(
      existingError.message || "Impossibile verificare le lezioni esistenti.",
    );
  }
  if ((existing?.length ?? 0) > 0) {
    return ok(courseId, [
      "Il corso ha già delle lezioni: la generazione automatica è stata saltata.",
    ]);
  }

  const term = await loadCourseTerm(client, course.termId);
  if (!term) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }

  const closures = await listSchoolClosures(client);
  const plan = buildCourseLessonSchedulePlan(
    {
      startsOn: course.startsOn,
      weeklyDow: course.weeklyDow,
      weeklyStartMinute: course.weeklyStartMinute,
      durationMinutes: course.durationMinutes,
    },
    term,
    closures,
    { planFrom: maxDate(course.startsOn, term.startsOn) },
  );

  const warnings: string[] = [];
  const inserted = await insertPlannedLessonRows(
    client,
    course,
    plan.entries,
    1,
  );
  if ("errorMessage" in inserted) {
    return fail(inserted.errorMessage);
  }
  warnings.push(...inserted.warnings);

  for (let i = 0; i < plan.unplacedMakeupCount; i += 1) {
    const { error } = await client.from("lessons").insert({
      course_id: courseId,
      sequence_number: plan.entries.length + 1 + i,
      starts_at: null,
      ends_at: null,
      room_id: course.roomId,
      booking_id: null,
      placement: "da_piazzare",
    });
    if (error) {
      return fail(error.message || "Impossibile salvare le lezioni da piazzare.");
    }
  }

  if (plan.entries.length === 0 && plan.unplacedMakeupCount === 0) {
    return fail("Nessuna lezione da generare nell'anno corsi.", { id: courseId });
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

/** Ripristina `starts_at`/`ends_at` da programmazione corso (lezioni già in DB senza orario). */
export async function repairCourseLessonCalendarTimes(
  client: CoursesClient,
  courseId: string,
): Promise<CourseMutationResult> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }

  const { data: broken, error } = await client
    .from("lessons")
    .select("id, sequence_number")
    .eq("course_id", courseId)
    .is("cancelled_at", null)
    .is("starts_at", null)
    .order("sequence_number", { ascending: true });
  if (error) {
    return fail(error.message || "Impossibile leggere le lezioni.");
  }
  if (!broken?.length) {
    return ok(courseId);
  }

  const term = await loadCourseTerm(client, course.termId);
  if (!term) {
    return fail("Manca l’anno corsi in Impostazioni.");
  }

  const closures = await listSchoolClosures(client);
  const plan = buildCourseLessonSchedulePlan(
    {
      startsOn: course.startsOn,
      weeklyDow: course.weeklyDow,
      weeklyStartMinute: course.weeklyStartMinute,
      durationMinutes: course.durationMinutes,
    },
    term,
    closures,
    { planFrom: maxDate(course.startsOn, term.startsOn) },
  );

  let fixed = 0;
  for (const lesson of broken) {
    const entry = plan.entries[lesson.sequence_number - 1];
    if (!entry) continue;
    const { error: updateError } = await client
      .from("lessons")
      .update({ starts_at: entry.startsAt, ends_at: entry.endsAt })
      .eq("id", lesson.id);
    if (!updateError) fixed += 1;
  }

  return ok(
    courseId,
    fixed > 0
      ? [`Orari calendario ripristinati per ${fixed} lezione/i.`]
      : undefined,
  );
}

export async function repairAllCourseLessonCalendarTimes(
  client: CoursesClient,
): Promise<void> {
  const { data, error } = await client
    .from("lessons")
    .select("course_id")
    .is("cancelled_at", null)
    .is("starts_at", null);
  if (error || !data?.length) return;

  const courseIds = [...new Set(data.map((row) => row.course_id))];
  for (const courseId of courseIds) {
    await repairCourseLessonCalendarTimes(client, courseId);
  }
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
  // Solo il titolare con canReschedule — niente bypass staff.
  if (course.titularMemberId !== input.actor.memberId) {
    return fail("Solo il docente titolare può piazzare le lezioni.");
  }
  if (!input.actor.canReschedule) {
    return fail("Non hai il permesso di piazzare o recuperare lezioni.");
  }
  if (course.status !== "attivo") {
    return fail("Si possono piazzare lezioni solo su un corso attivo.");
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
    if (bookingId) {
      await cancelHoldBooking(client, bookingId);
    }
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

export type PatchCourseInput = {
  subjectId?: string;
  roomId?: string | null;
  durationMinutes?: CourseDurationMinutes;
  weeklyDow?: IsoWeekday | number;
  weeklyStartMinute?: number;
  startsOn?: string;
  priceEur?: number;
  maxStudents?: number;
};

export type CourseDeletePreview = {
  activeLessonCount: number;
  hasCreditConsumption: boolean;
  hasBlockingFees: boolean;
  canDelete: boolean;
  blockReason?: string;
};

export async function getCourseDeletePreview(
  client: CoursesClient,
  courseId: string,
): Promise<CourseDeletePreview> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return {
      activeLessonCount: 0,
      hasCreditConsumption: false,
      hasBlockingFees: false,
      canDelete: false,
      blockReason: "Corso non trovato.",
    };
  }

  const [lessonsRes, consumoRes, feesRes] = await Promise.all([
    client
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .is("cancelled_at", null),
    client
      .from("lesson_credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("kind", "consumo"),
    client
      .from("lesson_fees")
      .select("status")
      .eq("course_id", courseId),
  ]);

  if (lessonsRes.error || consumoRes.error || feesRes.error) {
    return {
      activeLessonCount: 0,
      hasCreditConsumption: false,
      hasBlockingFees: false,
      canDelete: false,
      blockReason: "Impossibile verificare lo stato del corso.",
    };
  }

  const activeLessonCount = lessonsRes.count ?? 0;
  const hasCreditConsumption = (consumoRes.count ?? 0) > 0;
  const hasBlockingFees = (feesRes.data ?? []).some(
    (row) => row.status === "saldata" || row.status === "parziale",
  );

  let blockReason: string | undefined;
  if (hasCreditConsumption) {
    blockReason =
      "Corso con presenze o consumi wallet registrati: non eliminabile. Chiudi il corso.";
  } else if (hasBlockingFees) {
    blockReason =
      "Ci sono rette pagate o parziali su questo corso: non eliminabile.";
  }

  return {
    activeLessonCount,
    hasCreditConsumption,
    hasBlockingFees,
    canDelete: !blockReason,
    blockReason,
  };
}

export async function patchCourse(
  client: CoursesClient,
  courseId: string,
  input: PatchCourseInput,
  actor: LessonScheduleActor,
  options?: { bypassSlotLessonGuard?: boolean },
): Promise<CourseMutationResult> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.isTrial) {
    return fail("Modifica dalla scheda lezione di prova.");
  }
  if (course.status === "chiuso" || course.status === "rifiutato") {
    return fail("Non si può modificare un corso chiuso o rifiutato.");
  }

  const isTitular = course.titularMemberId === actor.memberId;
  const staffEdit =
    actor.isStaff &&
    (course.status === "attivo" ||
      course.status === "in_pausa" ||
      course.status === "in_attesa");
  const teacherEdit =
    !actor.isStaff &&
    isTitular &&
    actor.canReschedule &&
    (course.status === "attivo" || course.status === "in_pausa");

  if (!staffEdit && !teacherEdit) {
    return fail("Non hai il permesso di modificare questo corso.");
  }

  const patch: Database["public"]["Tables"]["courses"]["Update"] = {};
  const warnings: string[] = [];

  if (staffEdit) {
    if (input.subjectId != null && input.subjectId !== course.subjectId) {
      if (!input.subjectId.trim()) {
        return fail("La materia è obbligatoria.");
      }
      patch.subject_id = input.subjectId;
    }
    if (input.startsOn != null && input.startsOn !== course.startsOn) {
      if (!ISO_DATE_RE.test(input.startsOn)) {
        return fail("La data di inizio non è valida.");
      }
      patch.starts_on = input.startsOn;
    }
    if (input.priceEur != null && input.priceEur !== course.priceEur) {
      if (!Number.isFinite(input.priceEur) || input.priceEur < 0) {
        return fail("Il prezzo non è valido.");
      }
      patch.price_eur = input.priceEur;
    }
    if (
      input.maxStudents != null &&
      course.courseKind === "gruppo" &&
      input.maxStudents !== course.maxStudents
    ) {
      if (!Number.isInteger(input.maxStudents) || input.maxStudents < 1) {
        return fail("La capienza non è valida.");
      }
      patch.max_students = input.maxStudents;
    }
  }

  const slotChanging =
    (input.durationMinutes != null &&
      input.durationMinutes !== course.durationMinutes) ||
    (input.weeklyDow != null && input.weeklyDow !== course.weeklyDow) ||
    (input.weeklyStartMinute != null &&
      input.weeklyStartMinute !== course.weeklyStartMinute) ||
    (input.roomId !== undefined && input.roomId !== course.roomId) ||
    (input.startsOn != null && input.startsOn !== course.startsOn);

  if (
    input.durationMinutes != null ||
    input.weeklyDow != null ||
    input.weeklyStartMinute != null ||
    input.roomId !== undefined
  ) {
    if (!staffEdit && !teacherEdit) {
      return fail("Non puoi modificare slot o sala.");
    }
  }

  if (
    input.durationMinutes != null &&
    input.durationMinutes !== course.durationMinutes
  ) {
    if (!DURATION_MINUTES.has(input.durationMinutes)) {
      return fail("La durata deve essere 30, 45, 60 o 90 minuti.");
    }
    patch.duration_minutes = input.durationMinutes;
  }
  if (input.weeklyDow != null && input.weeklyDow !== course.weeklyDow) {
    if (!isIsoWeekday(input.weeklyDow)) {
      return fail("Giorno della settimana non valido.");
    }
    patch.weekly_dow = input.weeklyDow;
  }
  if (
    input.weeklyStartMinute != null &&
    input.weeklyStartMinute !== course.weeklyStartMinute
  ) {
    if (
      !Number.isInteger(input.weeklyStartMinute) ||
      input.weeklyStartMinute < 0 ||
      input.weeklyStartMinute > 1439
    ) {
      return fail("L'orario settimanale non è valido.");
    }
    patch.weekly_start_minute = input.weeklyStartMinute;
  }
  if (input.roomId !== undefined && input.roomId !== course.roomId) {
    if (course.courseKind === "online") {
      if (input.roomId) {
        return fail("Un corso online non può avere una sala.");
      }
      patch.room_id = null;
    } else if (!input.roomId) {
      return fail("La sala è obbligatoria.");
    } else {
      patch.room_id = input.roomId;
    }
  }

  if (Object.keys(patch).length === 0) {
    // Salva senza differenze: ok silenzioso (evita errore fuorviante).
    return ok(courseId);
  }

  if (patch.subject_id && patch.subject_id !== course.subjectId) {
    const detail = await getCourse(client, courseId);
    const [subjectRes, firstEnrollment] = await Promise.all([
      client
        .from("lesson_subjects")
        .select("name")
        .eq("id", patch.subject_id)
        .maybeSingle(),
      detail?.enrollments.find((row) => !row.leftAt) ?? detail?.enrollments[0],
    ]);
    if (!subjectRes.data) {
      return fail("Materia non trovata.");
    }
    if (course.courseKind === "gruppo") {
      patch.name = `Gruppo ${subjectRes.data.name}`;
    } else if (firstEnrollment) {
      patch.name = `${subjectRes.data.name} — ${memberLabel(firstEnrollment.lastName, firstEnrollment.firstName)}`;
    }
  }

  // Solo se giorno/ora/sala/durata cambiano davvero: altrimenti il form
  // rimandava sempre i campi slot e bloccava anche un Salva a vuoto.
  if (slotChanging && !options?.bypassSlotLessonGuard) {
    const { data: lessonRows } = await client
      .from("lessons")
      .select("id")
      .eq("course_id", courseId)
      .is("cancelled_at", null)
      .limit(1);
    if ((lessonRows?.length ?? 0) > 0) {
      return fail(
        "Per cambiare giorno, ora o sala usa la conferma della nuova programmazione.",
      );
    }
  }

  const { error } = await client.from("courses").update(patch).eq("id", courseId);
  if (error) {
    return fail(error.message || "Impossibile aggiornare il corso.");
  }

  return ok(courseId, warnings.length > 0 ? warnings : undefined);
}

function assertScheduleEditPermission(
  course: Course,
  actor: LessonScheduleActor,
):
  | { ok: true; staffEdit: boolean; teacherEdit: boolean }
  | { ok: false; errorMessage: string } {
  if (course.isTrial) {
    return { ok: false, errorMessage: "Modifica dalla scheda lezione di prova." };
  }
  if (course.status === "chiuso" || course.status === "rifiutato") {
    return {
      ok: false,
      errorMessage: "Non si può modificare un corso chiuso o rifiutato.",
    };
  }
  const isTitular = course.titularMemberId === actor.memberId;
  const staffEdit =
    actor.isStaff &&
    (course.status === "attivo" ||
      course.status === "in_pausa" ||
      course.status === "in_attesa");
  const teacherEdit =
    !actor.isStaff &&
    isTitular &&
    actor.canReschedule &&
    (course.status === "attivo" || course.status === "in_pausa");
  if (!staffEdit && !teacherEdit) {
    return {
      ok: false,
      errorMessage: "Non hai il permesso di modificare questo corso.",
    };
  }
  return { ok: true, staffEdit, teacherEdit };
}

export async function previewCourseScheduleResync(
  client: CoursesClient,
  courseId: string,
  patch: PatchCourseInput,
  actor: LessonScheduleActor,
): Promise<
  | { success: true; preview: CourseSchedulePreview }
  | { success: false; errorMessage: string }
> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return { success: false, errorMessage: "Corso non trovato." };
  }
  const permission = assertScheduleEditPermission(course, actor);
  if (!permission.ok) {
    return { success: false, errorMessage: permission.errorMessage };
  }

  const schedule = mergedScheduleParams(course, patch);
  if (!isIsoWeekday(schedule.weeklyDow)) {
    return { success: false, errorMessage: "Giorno della settimana non valido." };
  }
  if (course.courseKind !== "online" && !schedule.roomId) {
    return { success: false, errorMessage: "La sala è obbligatoria." };
  }

  const term = await loadCourseTerm(client, course.termId);
  if (!term) {
    return { success: false, errorMessage: "Manca l'anno corsi in Impostazioni." };
  }

  const closures = await listSchoolClosures(client);
  const today = todayInRome();
  const plan = buildCourseLessonSchedulePlan(
    {
      startsOn: schedule.startsOn,
      weeklyDow: schedule.weeklyDow,
      weeklyStartMinute: schedule.weeklyStartMinute,
      durationMinutes: schedule.durationMinutes,
    },
    term,
    closures,
    { planFrom: today },
  );

  const rows: CourseSchedulePreviewRow[] = plan.entries
    .filter((entry) => entry.date >= today)
    .map((entry) => ({
      rowKey: planEntryRowKey(entry),
      date: entry.date,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      placement: "scheduled" as const,
      kind: entry.kind,
      replacedHolidayDate: entry.replacedHolidayDate,
      included: true,
    }));

  for (let i = 0; i < plan.unplacedMakeupCount; i += 1) {
    rows.push({
      rowKey: `unplaced:${i}`,
      date: "",
      startsAt: null,
      endsAt: null,
      placement: "da_piazzare",
      kind: "holiday_makeup",
      included: true,
    });
  }

  const locked = await loadLockedLessonIds(client, courseId);
  if ("errorMessage" in locked) {
    return { success: false, errorMessage: locked.errorMessage };
  }

  const warnings: string[] = [];
  if (locked.size > 0) {
    warnings.push(
      `${locked.size} lezioni passate o con presenze/consumi restano invariate.`,
    );
  }

  return {
    success: true,
    preview: {
      rows,
      skippedHolidays: plan.skippedHolidayDates.filter((d) => d >= today),
      lockedLessonCount: locked.size,
      warnings,
    },
  };
}

export async function applyCourseScheduleResync(
  client: CoursesClient,
  courseId: string,
  patch: PatchCourseInput,
  planRows: ApplyCourseScheduleRow[],
  actor: LessonScheduleActor,
): Promise<CourseMutationResult> {
  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  const permission = assertScheduleEditPermission(course, actor);
  if (!permission.ok) {
    return fail(permission.errorMessage);
  }

  const locked = await loadLockedLessonIds(client, courseId);
  if ("errorMessage" in locked) {
    return fail(locked.errorMessage);
  }

  const patchResult = await patchCourse(client, courseId, patch, actor, {
    bypassSlotLessonGuard: true,
  });
  if (!patchResult.success) {
    return patchResult;
  }

  const updatedCourse = await loadCourse(client, courseId);
  if (!updatedCourse) {
    return fail("Corso non trovato dopo l'aggiornamento.");
  }

  const term = await loadCourseTerm(client, updatedCourse.termId);
  if (!term) {
    return fail("Manca l'anno corsi in Impostazioni.");
  }
  const closures = await listSchoolClosures(client);
  const schedule = mergedScheduleParams(updatedCourse, {});
  const draft = buildCourseLessonSchedulePlan(schedule, term, closures, {
    planFrom: todayInRome(),
  });
  const draftByKey = new Map(
    draft.entries.map((entry) => [planEntryRowKey(entry), entry]),
  );

  const included = planRows.filter((row) => row.included);
  const resolvedEntries: CourseLessonPlanEntry[] = [];
  let unplacedIncluded = 0;

  for (const row of included) {
    if (row.rowKey.startsWith("unplaced:")) {
      unplacedIncluded += 1;
      continue;
    }
    if (row.rowKey.startsWith("manual:")) {
      const startsAt = romeDateTimeToUtcIso(
        row.date,
        updatedCourse.weeklyStartMinute,
      );
      resolvedEntries.push({
        date: row.date,
        startsAt,
        endsAt: addMinutesIso(startsAt, updatedCourse.durationMinutes),
        kind: "manual_holiday",
        replacedHolidayDate: row.replacedHolidayDate,
      });
      continue;
    }
    const fromDraft = draftByKey.get(row.rowKey);
    if (fromDraft) {
      resolvedEntries.push(fromDraft);
    }
  }

  const cancelError = await cancelReplaceableFutureLessons(
    client,
    courseId,
    locked,
  );
  if (cancelError.errorMessage) {
    return fail(cancelError.errorMessage);
  }

  const { data: seqRow } = await client
    .from("lessons")
    .select("sequence_number")
    .eq("course_id", courseId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sequenceStart = (seqRow?.sequence_number ?? 0) + 1;

  const warnings = [...(patchResult.warnings ?? [])];
  if (resolvedEntries.length > 0) {
    const inserted = await insertPlannedLessonRows(
      client,
      updatedCourse,
      resolvedEntries.sort((a, b) => a.date.localeCompare(b.date)),
      sequenceStart,
    );
    if ("errorMessage" in inserted) {
      return fail(inserted.errorMessage);
    }
    warnings.push(...inserted.warnings);
    sequenceStart += resolvedEntries.length;
  }

  for (let i = 0; i < unplacedIncluded; i += 1) {
    const { error } = await client.from("lessons").insert({
      course_id: courseId,
      sequence_number: sequenceStart + i,
      starts_at: null,
      ends_at: null,
      room_id: updatedCourse.roomId,
      booking_id: null,
      placement: "da_piazzare",
    });
    if (error) {
      return fail(error.message || "Impossibile salvare le lezioni da piazzare.");
    }
  }

  return ok(courseId, warnings.length > 0 ? warnings : undefined);
}

export async function adminDeleteCourse(
  client: CoursesClient,
  courseId: string,
  actor: { memberId: string; isStaff: boolean },
  options: { purgeProgramming: boolean },
): Promise<CourseMutationResult> {
  if (!actor.isStaff) {
    return fail("Solo l'amministrazione può eliminare un corso.");
  }

  const course = await loadCourse(client, courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }

  if (course.isTrial) {
    await cancelHoldBooking(client, course.holdBookingId);
    const { error } = await client.from("courses").delete().eq("id", courseId);
    if (error) {
      return fail(error.message || "Impossibile eliminare la lezione di prova.");
    }
    return ok(courseId);
  }

  const preview = await getCourseDeletePreview(client, courseId);
  if (!preview.canDelete) {
    return fail(preview.blockReason ?? "Impossibile eliminare il corso.");
  }

  if (preview.activeLessonCount > 0 && !options.purgeProgramming) {
    return fail(
      "C'è programmazione attiva. Conferma la cancellazione della programmazione.",
    );
  }

  const { data: lessonRows, error: lessonsError } = await client
    .from("lessons")
    .select("id, booking_id")
    .eq("course_id", courseId);
  if (lessonsError) {
    return fail(lessonsError.message || "Impossibile caricare le lezioni.");
  }

  const lessonIds = (lessonRows ?? []).map((row) => row.id);

  for (const row of lessonRows ?? []) {
    if (row.booking_id) {
      await cancelHoldBooking(client, row.booking_id);
    }
  }

  if (lessonIds.length > 0) {
    await client
      .from("lesson_reminder_log")
      .delete()
      .in("lesson_id", lessonIds);
    await client.from("lesson_attendances").delete().in("lesson_id", lessonIds);
  }

  await client.from("lesson_change_requests").delete().eq("course_id", courseId);
  await client.from("lesson_credit_ledger").delete().eq("course_id", courseId);
  await client.from("lesson_fees").delete().eq("course_id", courseId);
  await client.from("lessons").delete().eq("course_id", courseId);
  await cancelHoldBooking(client, course.holdBookingId);

  await client.from("course_lifecycle_events").delete().eq("course_id", courseId);
  await client.from("course_teachers").delete().eq("course_id", courseId);
  await client.from("course_enrollments").delete().eq("course_id", courseId);

  const { error: deleteError } = await client
    .from("courses")
    .delete()
    .eq("id", courseId);
  if (deleteError) {
    return fail(deleteError.message || "Impossibile eliminare il corso.");
  }

  return ok(courseId);
}
