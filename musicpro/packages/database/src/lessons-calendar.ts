import type { SupabaseClient } from "@supabase/supabase-js";

import { getRomeDayBoundsUtc } from "./bookings";
import {
  cancelHoldBooking,
  createLessonBooking,
  getCourse,
  resolveLessonCalendarTitle,
  type CourseKind,
  type CourseMutationResult,
  type CourseStatus,
  type Lesson,
  type LessonScheduleActor,
} from "./courses";
import { notifyLessonScheduleChange } from "./lessons-notify";
import type { Database } from "./types/database";

type CalendarClient = SupabaseClient<Database>;

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LESSON_COLUMNS =
  "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at";

export type ListLessonsCalendarOptions = {
  titularMemberId?: string;
  /** Titolare o riga attiva in `course_teachers` (coordinatore). */
  teacherMemberId?: string;
  /** Iscritto (o ward del tutore): filtra sui corsi con enrollment attivo. */
  studentMemberId?: string;
  roomId?: string;
  includePendingHold?: boolean;
};

export type ListLessonsInRangeInput = ListLessonsCalendarOptions & {
  /** ISO timestamptz oppure YYYY-MM-DD (mezzanotte Europe/Rome). Inclusivo. */
  from: string;
  /**
   * Estremo esclusivo.
   * ISO timestamptz usato così com'è; YYYY-MM-DD = mezzanotte Europe/Rome di quel giorno.
   * Esempio: `{ from: "2026-08-18", to: "2026-08-19" }` = intera giornata del 18 a Roma.
   */
  to: string;
};

export type MoveLessonInput = {
  startsAt: string;
  roomId?: string | null;
  scope: "this" | "future";
  forceTeacherOverlap?: boolean;
  actor?: LessonScheduleActor;
};

export type RequestLessonMoveInput = {
  lessonId: string;
  startsAt: string;
  roomId?: string | null;
  scope: "this" | "future";
  note?: string | null;
  createdBy: string;
};

export interface CalendarLesson extends Lesson {
  courseName: string;
  courseKind: CourseKind;
  courseStatus: CourseStatus;
  isTrial: boolean;
  subjectName: string;
  titularMemberId: string;
  titularFirstName: string;
  titularLastName: string;
  /** «Cognome Nome» degli iscritti attivi (`left_at` null). */
  studentNames: string[];
  /**
   * Telefoni allievi, stesso ordine di `studentNames`.
   * Preferisce `phone`, altrimenti `manual_tutor_phone`; stringa vuota se assente.
   */
  studentPhones: string[];
  roomName: string | null;
  /** True se esiste almeno una riga in lesson_attendances. */
  hasAttendance: boolean;
}

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

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function studentLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function studentPhone(row: {
  phone: string | null;
  manual_tutor_phone: string | null;
}): string {
  const phone = row.phone?.trim() ?? "";
  if (phone) return phone;
  return row.manual_tutor_phone?.trim() ?? "";
}

function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Converte un bound in ISO UTC.
 * YYYY-MM-DD → mezzanotte Europe/Rome; altrimenti timestamptz.
 */
function resolveRangeBound(value: string, label: string): string {
  const trimmed = value.trim();
  if (ISO_DATE_RE.test(trimmed)) {
    return getRomeDayBoundsUtc(trimmed).startUtc;
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw new Error(`${label} non è valida.`);
  }
  return new Date(ms).toISOString();
}

async function lessonIdsWithAttendance(
  client: CalendarClient,
  lessonIds: string[],
  opts?: { softFail?: boolean },
): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const { data, error } = await client
    .from("lesson_attendances")
    .select("lesson_id")
    .in("lesson_id", lessonIds);
  if (error) {
    // Soft-fail solo sul list calendar (studente/tutore): moveLesson deve fallire.
    if (opts?.softFail) return new Set();
    throw new Error(
      `Impossibile verificare le presenze: ${error.message}`,
    );
  }
  return new Set((data ?? []).map((row) => row.lesson_id));
}

async function loadLesson(
  client: CalendarClient,
  lessonId: string,
): Promise<{ lesson: Lesson | null; errorMessage?: string }> {
  const { data, error } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("id", lessonId)
    .maybeSingle();

  if (error) {
    return { lesson: null, errorMessage: error.message || "Impossibile caricare la lezione." };
  }
  return { lesson: data ? mapLesson(data) : null };
}

async function collectOverlapWarnings(
  client: CalendarClient,
  params: {
    lessonId: string;
    excludeLessonIds: Set<string>;
    titularMemberId: string;
    studentMemberIds: string[];
    startsAt: string;
    endsAt: string;
    forceTeacherOverlap: boolean;
  },
): Promise<string[]> {
  const warnings: string[] = [];

  const { data: overlapping, error } = await client
    .from("lessons")
    .select("id, course_id, starts_at, ends_at")
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .lt("starts_at", params.endsAt)
    .gt("ends_at", params.startsAt)
    .neq("id", params.lessonId);

  if (error) {
    throw new Error(`Impossibile verificare le sovrapposizioni: ${error.message}`);
  }

  const others = (overlapping ?? []).filter((row) => {
    if (params.excludeLessonIds.has(row.id)) return false;
    if (!row.starts_at || !row.ends_at) return false;
    return intervalsOverlap(
      row.starts_at,
      row.ends_at,
      params.startsAt,
      params.endsAt,
    );
  });

  if (others.length === 0) return warnings;

  const courseIds = [...new Set(others.map((row) => row.course_id))];
  const { data: courseRows, error: courseError } = await client
    .from("courses")
    .select("id, titular_member_id")
    .in("id", courseIds);

  if (courseError) {
    throw new Error(
      `Impossibile caricare i corsi per le sovrapposizioni: ${courseError.message}`,
    );
  }

  if (
    !params.forceTeacherOverlap &&
    (courseRows ?? []).some(
      (row) => row.titular_member_id === params.titularMemberId,
    )
  ) {
    warnings.push("Il docente ha già una lezione in questo orario.");
  }

  if (params.studentMemberIds.length === 0) return warnings;

  const { data: enrollments, error: enrollmentError } = await client
    .from("course_enrollments")
    .select("member_id")
    .in("course_id", courseIds)
    .is("left_at", null);

  if (enrollmentError) {
    throw new Error(
      `Impossibile verificare gli allievi in sovrapposizione: ${enrollmentError.message}`,
    );
  }

  const otherStudents = new Set((enrollments ?? []).map((row) => row.member_id));
  if (params.studentMemberIds.some((id) => otherStudents.has(id))) {
    warnings.push("Uno o più allievi hanno già una lezione in questo orario.");
  }

  return warnings;
}

async function applyLessonSlot(
  client: CalendarClient,
  params: {
    lesson: Lesson;
    titularMemberId: string;
    startsAt: string;
    endsAt: string;
    roomId: string | null;
    title: string;
  },
): Promise<
  | { ok: true; bookingId: string | null }
  | { ok: false; errorCode?: string; errorMessage: string }
> {
  if (params.lesson.bookingId) {
    const cancelError = await cancelHoldBooking(client, params.lesson.bookingId);
    if (cancelError) {
      return { ok: false, errorCode: "CANCEL_FAILED", errorMessage: cancelError };
    }
  }

  let bookingId: string | null = null;
  if (params.roomId) {
    const booked = await createLessonBooking(client, {
      roomId: params.roomId,
      memberId: params.titularMemberId,
      startAt: params.startsAt,
      endAt: params.endsAt,
      title: params.title,
    });
    if (!booked.bookingId) {
      return {
        ok: false,
        errorCode: booked.errorCode,
        errorMessage:
          booked.errorCode === "SLOT_TAKEN"
            ? "Lo slot è già occupato."
            : booked.errorMessage || "Impossibile occupare la sala.",
      };
    }
    bookingId = booked.bookingId;
  }

  return { ok: true, bookingId };
}

/**
 * Lezioni `scheduled` non annullate con `starts_at` in `[from, to)`.
 * `to` è **esclusivo** (non fine giornata inclusiva).
 */
export async function listLessonsInRange(
  client: CalendarClient,
  input: ListLessonsInRangeInput,
): Promise<CalendarLesson[]> {
  const from = resolveRangeBound(input.from, "La data di inizio");
  const to = resolveRangeBound(input.to, "La data di fine");
  if (from >= to) return [];

  const allowedStatuses: CourseStatus[] = input.includePendingHold
    ? ["attivo", "in_attesa"]
    : ["attivo"];

  let query = client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .is("cancelled_at", null)
    .eq("placement", "scheduled")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true })
    .order("sequence_number", { ascending: true });

  if (input.roomId) {
    query = query.eq("room_id", input.roomId);
  }

  const teacherCourseIds = input.teacherMemberId
    ? await resolveTeacherCourseIds(client, input.teacherMemberId)
    : undefined;
  if (teacherCourseIds) {
    if (teacherCourseIds.length === 0) {
      if (!input.includePendingHold) return [];
      return listHoldCardsInRange(client, {
        from,
        to,
        teacherCourseIds,
        roomId: input.roomId,
      });
    }
    query = query.in("course_id", teacherCourseIds);
  }

  const studentCourseIds = input.studentMemberId
    ? await resolveStudentCourseIds(client, input.studentMemberId)
    : undefined;
  if (studentCourseIds) {
    if (studentCourseIds.length === 0) return [];
    query = query.in("course_id", studentCourseIds);
  }

  const { data: lessonRows, error: lessonError } = await query;
  if (lessonError) {
    throw new Error(`Impossibile caricare le lezioni: ${lessonError.message}`);
  }
  if (!lessonRows?.length) {
    if (!input.includePendingHold) return [];
    return listHoldCardsInRange(client, {
      from,
      to,
      titularMemberId: input.titularMemberId,
      teacherCourseIds,
      teacherMemberId: input.teacherMemberId,
      roomId: input.roomId,
    });
  }

  const courseIds = [...new Set(lessonRows.map((row) => row.course_id))];
  let coursesQuery = client
    .from("courses")
    .select(
      "id, name, course_kind, status, subject_id, titular_member_id, room_id, is_trial",
    )
    .in("id", courseIds)
    .in("status", allowedStatuses);

  if (!teacherCourseIds && input.titularMemberId) {
    coursesQuery = coursesQuery.eq("titular_member_id", input.titularMemberId);
  }

  const { data: courseRows, error: courseError } = await coursesQuery;
  if (courseError) {
    throw new Error(`Impossibile caricare i corsi: ${courseError.message}`);
  }

  const coursesById = new Map((courseRows ?? []).map((row) => [row.id, row]));
  const visibleLessons = lessonRows.filter((row) => coursesById.has(row.course_id));
  if (visibleLessons.length === 0) return [];

  const visibleCourses = [...coursesById.values()];
  const subjectIds = [
    ...new Set(visibleCourses.map((row) => row.subject_id)),
  ];
  const titularIds = [
    ...new Set(visibleCourses.map((row) => row.titular_member_id)),
  ];
  const roomIds = [
    ...new Set(
      visibleLessons
        .map((row) => row.room_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const visibleCourseIds = visibleCourses.map((row) => row.id);

  const [subjectsRes, titularsRes, roomsRes, enrollmentsRes] = await Promise.all([
    subjectIds.length > 0
      ? client.from("lesson_subjects").select("id, name").in("id", subjectIds)
      : Promise.resolve({ data: [], error: null }),
    titularIds.length > 0
      ? client
          .from("members")
          .select("id, first_name, last_name")
          .in("id", titularIds)
      : Promise.resolve({ data: [], error: null }),
    roomIds.length > 0
      ? client.from("rooms").select("id, name").in("id", roomIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("course_enrollments")
      .select("course_id, member_id")
      .in("course_id", visibleCourseIds)
      .is("left_at", null),
  ]);

  if (subjectsRes.error) {
    throw new Error(
      `Impossibile caricare le materie: ${subjectsRes.error.message}`,
    );
  }
  if (titularsRes.error) {
    throw new Error(
      `Impossibile caricare i titolari: ${titularsRes.error.message}`,
    );
  }
  if (roomsRes.error) {
    throw new Error(`Impossibile caricare le sale: ${roomsRes.error.message}`);
  }
  if (enrollmentsRes.error) {
    throw new Error(
      `Impossibile caricare gli iscritti: ${enrollmentsRes.error.message}`,
    );
  }

  const subjectById = new Map(
    (subjectsRes.data ?? []).map((row) => [row.id, row.name]),
  );
  const titularById = new Map(
    (titularsRes.data ?? []).map((row) => [row.id, row]),
  );
  const roomById = new Map((roomsRes.data ?? []).map((row) => [row.id, row.name]));

  const enrollments = enrollmentsRes.data ?? [];
  const studentIds = [...new Set(enrollments.map((row) => row.member_id))];
  const studentsById = new Map<
    string,
    {
      first_name: string;
      last_name: string;
      phone: string | null;
      manual_tutor_phone: string | null;
    }
  >();

  if (studentIds.length > 0) {
    const { data: students, error: studentsError } = await client
      .from("members")
      .select("id, first_name, last_name, phone, manual_tutor_phone")
      .in("id", studentIds);
    if (studentsError) {
      throw new Error(
        `Impossibile caricare gli allievi: ${studentsError.message}`,
      );
    }
    for (const student of students ?? []) {
      studentsById.set(student.id, student);
    }
  }

  type StudentEntry = { name: string; phone: string };
  const studentsByCourse = new Map<string, StudentEntry[]>();
  for (const enrollment of enrollments) {
    const student = studentsById.get(enrollment.member_id);
    if (!student) continue;
    const list = studentsByCourse.get(enrollment.course_id) ?? [];
    list.push({
      name: studentLabel(student.last_name, student.first_name),
      phone: studentPhone(student),
    });
    studentsByCourse.set(enrollment.course_id, list);
  }
  for (const [courseId, entries] of studentsByCourse) {
    entries.sort((a, b) => a.name.localeCompare(b.name, "it"));
    studentsByCourse.set(courseId, entries);
  }

  const mapped = visibleLessons.map((row) => {
    const course = coursesById.get(row.course_id)!;
    const titular = titularById.get(course.titular_member_id);
    const students = studentsByCourse.get(course.id) ?? [];
    return {
      ...mapLesson(row),
      courseName: course.name,
      courseKind: course.course_kind,
      courseStatus: course.status,
      isTrial: course.is_trial,
      subjectName: subjectById.get(course.subject_id) ?? "",
      titularMemberId: course.titular_member_id,
      titularFirstName: titular?.first_name ?? "",
      titularLastName: titular?.last_name ?? "",
      studentNames: students.map((s) => s.name),
      studentPhones: students.map((s) => s.phone),
      roomName: row.room_id ? roomById.get(row.room_id) ?? null : null,
      hasAttendance: false,
    };
  });

  const attendedIds = await lessonIdsWithAttendance(
    client,
    mapped.map((row) => row.id),
    { softFail: true },
  );
  for (const lesson of mapped) {
    lesson.hasAttendance = attendedIds.has(lesson.id);
  }

  if (!input.includePendingHold) {
    return mapped;
  }

  const holds = await listHoldCardsInRange(client, {
    from,
    to,
    titularMemberId: input.titularMemberId,
    teacherCourseIds,
    teacherMemberId: input.teacherMemberId,
    roomId: input.roomId,
  });
  return [...mapped, ...holds].sort((a, b) =>
    (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
  );
}

async function resolveTeacherCourseIds(
  client: CalendarClient,
  teacherMemberId: string,
): Promise<string[]> {
  const [titularRes, assignedRes] = await Promise.all([
    client.from("courses").select("id").eq("titular_member_id", teacherMemberId),
    client
      .from("course_teachers")
      .select("course_id")
      .eq("member_id", teacherMemberId)
      .is("ends_on", null),
  ]);
  if (titularRes.error) {
    throw new Error(`Impossibile caricare i corsi: ${titularRes.error.message}`);
  }
  if (assignedRes.error) {
    throw new Error(
      `Impossibile caricare i corsi coordinati: ${assignedRes.error.message}`,
    );
  }
  const ids = new Set<string>();
  for (const row of titularRes.data ?? []) ids.add(row.id);
  for (const row of assignedRes.data ?? []) ids.add(row.course_id);
  return [...ids];
}

async function resolveStudentCourseIds(
  client: CalendarClient,
  studentMemberId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("course_enrollments")
    .select("course_id")
    .eq("member_id", studentMemberId)
    .is("left_at", null);
  if (error) {
    throw new Error(
      `Impossibile caricare i corsi dell'allievo: ${error.message}`,
    );
  }
  return [...new Set((data ?? []).map((row) => row.course_id))];
}

async function listHoldCardsInRange(
  client: CalendarClient,
  opts: {
    from: string;
    to: string;
    titularMemberId?: string;
    teacherMemberId?: string;
    teacherCourseIds?: string[];
    roomId?: string;
  },
): Promise<CalendarLesson[]> {
  let query = client
    .from("courses")
    .select(
      "id, name, course_kind, status, subject_id, titular_member_id, room_id, hold_booking_id, is_trial",
    )
    .eq("status", "in_attesa")
    .not("hold_booking_id", "is", null);

  const teacherCourseIds =
    opts.teacherCourseIds ??
    (opts.teacherMemberId
      ? await resolveTeacherCourseIds(client, opts.teacherMemberId)
      : undefined);
  if (teacherCourseIds) {
    if (teacherCourseIds.length === 0) return [];
    query = query.in("id", teacherCourseIds);
  } else if (opts.titularMemberId) {
    query = query.eq("titular_member_id", opts.titularMemberId);
  }

  const { data: pending, error } = await query;
  if (error || !pending?.length) return [];

  const bookingIds = pending
    .map((row) => row.hold_booking_id)
    .filter((id): id is string => Boolean(id));
  if (bookingIds.length === 0) return [];

  const { data: bookings, error: bookingError } = await client
    .from("bookings")
    .select("id, room_id, start_at, end_at, status")
    .in("id", bookingIds)
    .neq("status", "cancelled")
    .gte("start_at", opts.from)
    .lt("start_at", opts.to);

  if (bookingError || !bookings?.length) return [];

  const bookingById = new Map(bookings.map((row) => [row.id, row]));
  const visible = pending.filter((row) => {
    const booking = row.hold_booking_id
      ? bookingById.get(row.hold_booking_id)
      : undefined;
    if (!booking) return false;
    if (opts.roomId && booking.room_id !== opts.roomId) return false;
    return true;
  });
  if (visible.length === 0) return [];

  const subjectIds = [...new Set(visible.map((row) => row.subject_id))];
  const titularIds = [...new Set(visible.map((row) => row.titular_member_id))];
  const roomIds = [
    ...new Set(
      visible
        .map((row) => {
          const booking = row.hold_booking_id
            ? bookingById.get(row.hold_booking_id)
            : undefined;
          return booking?.room_id ?? row.room_id;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const courseIds = visible.map((row) => row.id);

  const [subjectsRes, titularsRes, roomsRes, enrollmentsRes] = await Promise.all([
    client.from("lesson_subjects").select("id, name").in("id", subjectIds),
    client.from("members").select("id, first_name, last_name").in("id", titularIds),
    roomIds.length > 0
      ? client.from("rooms").select("id, name").in("id", roomIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("course_enrollments")
      .select("course_id, member_id")
      .in("course_id", courseIds)
      .is("left_at", null),
  ]);

  const subjectById = new Map(
    (subjectsRes.data ?? []).map((row) => [row.id, row.name]),
  );
  const titularById = new Map(
    (titularsRes.data ?? []).map((row) => [row.id, row]),
  );
  const roomById = new Map((roomsRes.data ?? []).map((row) => [row.id, row.name]));
  const studentIds = [
    ...new Set((enrollmentsRes.data ?? []).map((row) => row.member_id)),
  ];
  const { data: students } =
    studentIds.length > 0
      ? await client
          .from("members")
          .select("id, first_name, last_name, phone, manual_tutor_phone")
          .in("id", studentIds)
      : { data: [] };
  const studentById = new Map((students ?? []).map((row) => [row.id, row]));
  type StudentEntry = { name: string; phone: string };
  const studentsByCourse = new Map<string, StudentEntry[]>();
  for (const enrollment of enrollmentsRes.data ?? []) {
    const student = studentById.get(enrollment.member_id);
    if (!student) continue;
    const list = studentsByCourse.get(enrollment.course_id) ?? [];
    list.push({
      name: studentLabel(student.last_name, student.first_name),
      phone: studentPhone(student),
    });
    studentsByCourse.set(enrollment.course_id, list);
  }
  for (const [courseId, entries] of studentsByCourse) {
    entries.sort((a, b) => a.name.localeCompare(b.name, "it"));
    studentsByCourse.set(courseId, entries);
  }

  return visible.map((course) => {
    const booking = bookingById.get(course.hold_booking_id!)!;
    const titular = titularById.get(course.titular_member_id);
    const roomId = booking.room_id ?? course.room_id;
    const students = studentsByCourse.get(course.id) ?? [];
    return {
      id: `hold:${course.id}`,
      courseId: course.id,
      sequenceNumber: 0,
      startsAt: booking.start_at,
      endsAt: booking.end_at,
      roomId,
      bookingId: booking.id,
      placement: "scheduled",
      cancelledAt: null,
      kind: "regular",
      recoveredFromLessonId: null,
      makeupMemberId: null,
      parkedReason: null,
      originalStartsAt: null,
      createdAt: course.id,
      updatedAt: course.id,
      courseName: course.name,
      courseKind: course.course_kind,
      courseStatus: "in_attesa",
      isTrial: false,
      subjectName: subjectById.get(course.subject_id) ?? "",
      titularMemberId: course.titular_member_id,
      titularFirstName: titular?.first_name ?? "",
      titularLastName: titular?.last_name ?? "",
      studentNames: students.map((s) => s.name),
      studentPhones: students.map((s) => s.phone),
      roomName: roomId ? roomById.get(roomId) ?? null : null,
      hasAttendance: false,
    };
  });
}

/**
 * Lezioni della giornata `date` (YYYY-MM-DD) in Europe/Rome.
 * Usa `[startUtc, endUtc)` da `getRomeDayBoundsUtc`.
 */
export async function listLessonsOnDate(
  client: CalendarClient,
  date: string,
  opts: ListLessonsCalendarOptions = {},
): Promise<CalendarLesson[]> {
  if (!ISO_DATE_RE.test(date.trim())) {
    throw new Error("La data non è valida.");
  }
  const { startUtc, endUtc } = getRomeDayBoundsUtc(date.trim());
  return listLessonsInRange(client, {
    from: startUtc,
    to: endUtc,
    ...opts,
  });
}

export async function moveLesson(
  client: CalendarClient,
  lessonId: string,
  input: MoveLessonInput,
): Promise<CourseMutationResult> {
  const startsMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startsMs)) {
    return fail("Data e ora della lezione non valide.");
  }
  if (input.scope !== "this" && input.scope !== "future") {
    return fail("Ambito di spostamento non valido.");
  }

  const loaded = await loadLesson(client, lessonId);
  if (loaded.errorMessage) return fail(loaded.errorMessage);
  if (!loaded.lesson) return fail("Lezione non trovata.");

  const lesson = loaded.lesson;
  if (lesson.cancelledAt) {
    return fail("La lezione è stata annullata.");
  }
  if (lesson.placement !== "scheduled") {
    return fail("Si possono spostare solo le lezioni in calendario.");
  }
  if (!lesson.startsAt) {
    return fail("La lezione non ha data e ora.");
  }

  try {
    const attended = await lessonIdsWithAttendance(client, [lessonId]);
    if (attended.has(lessonId)) {
      return fail(
        "Lezione già presenziata: sblocca la presenza prima di spostarla.",
      );
    }
  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "Impossibile verificare le presenze.",
    );
  }

  const course = await getCourse(client, lesson.courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (!input.actor) {
    return fail("Manca l'operatore dello spostamento.");
  }
  if (!input.actor.isStaff) {
    if (course.titularMemberId !== input.actor.memberId) {
      return fail("Puoi spostare solo le lezioni dei tuoi corsi.");
    }
    if (!input.actor.canReschedule) {
      return fail("Non hai il permesso di spostare le lezioni.");
    }
  }
  if (course.status === "in_attesa") {
    if (input.scope !== "this") {
      return fail("Su un corso in attesa si può spostare solo questa lezione.");
    }
  } else if (course.status !== "attivo") {
    return fail("Si possono spostare solo lezioni di un corso attivo.");
  }

  const startsAt = new Date(startsMs).toISOString();
  const endsAt = addMinutesIso(startsAt, course.durationMinutes);
  const roomId =
    course.courseKind === "online"
      ? null
      : (input.roomId ?? lesson.roomId ?? course.roomId);
  if (course.courseKind !== "online" && !roomId) {
    return fail("La sala è obbligatoria per i corsi in presenza.");
  }

  const originalStartsAt = lesson.startsAt;
  const deltaMs = new Date(startsAt).getTime() - new Date(originalStartsAt).getTime();
  const title = await resolveLessonCalendarTitle(client, course.id);
  const warnings: string[] = [];

  let futureLessons: Lesson[] = [];
  if (input.scope === "future") {
    const { data: futureRows, error: futureError } = await client
      .from("lessons")
      .select(LESSON_COLUMNS)
      .eq("course_id", course.id)
      .eq("placement", "scheduled")
      .is("cancelled_at", null)
      .gt("starts_at", originalStartsAt)
      .neq("id", lessonId)
      .order("starts_at", { ascending: true });

    if (futureError) {
      return fail(
        futureError.message || "Impossibile caricare le lezioni successive.",
      );
    }
    futureLessons = (futureRows ?? []).map(mapLesson);
    try {
      const futureAttended = await lessonIdsWithAttendance(
        client,
        futureLessons.map((row) => row.id),
      );
      if (futureAttended.size > 0) {
        return fail(
          "Lezione già presenziata: sblocca la presenza prima di spostarla.",
        );
      }
    } catch (err) {
      return fail(
        err instanceof Error
          ? err.message
          : "Impossibile verificare le presenze.",
      );
    }
  }

  const activeStudentIds = course.enrollments
    .filter((row) => !row.leftAt)
    .map((row) => row.memberId);

  try {
    const overlapWarnings = await collectOverlapWarnings(client, {
      lessonId,
      excludeLessonIds: new Set(futureLessons.map((row) => row.id)),
      titularMemberId: course.titularMemberId,
      studentMemberIds: activeStudentIds,
      startsAt,
      endsAt,
      forceTeacherOverlap: Boolean(input.forceTeacherOverlap),
    });
    warnings.push(...overlapWarnings);
  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "Impossibile verificare le sovrapposizioni.",
    );
  }

  const booked = await applyLessonSlot(client, {
    lesson,
    titularMemberId: course.titularMemberId,
    startsAt,
    endsAt,
    roomId,
    title,
  });
  if (!booked.ok) {
    return fail(booked.errorMessage);
  }

  const { error: updateError } = await client
    .from("lessons")
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
      room_id: roomId,
      booking_id: booked.bookingId,
      placement: "scheduled",
    })
    .eq("id", lessonId);

  if (updateError) {
    if (booked.bookingId) {
      await cancelHoldBooking(client, booked.bookingId);
    }
    return fail(updateError.message || "Impossibile aggiornare la lezione.");
  }

  for (const future of futureLessons) {
    if (!future.startsAt) continue;
    const futureStart = new Date(
      new Date(future.startsAt).getTime() + deltaMs,
    ).toISOString();
    const futureEnd = future.endsAt
      ? new Date(new Date(future.endsAt).getTime() + deltaMs).toISOString()
      : addMinutesIso(futureStart, course.durationMinutes);
    const futureRoomId =
      course.courseKind === "online"
        ? null
        : (input.roomId ?? future.roomId ?? course.roomId);

    if (course.courseKind !== "online" && !futureRoomId) {
      warnings.push(`Lezione #${future.sequenceNumber}: manca la sala.`);
      continue;
    }

    const futureBooked = await applyLessonSlot(client, {
      lesson: future,
      titularMemberId: course.titularMemberId,
      startsAt: futureStart,
      endsAt: futureEnd,
      roomId: futureRoomId,
      title,
    });

    if (!futureBooked.ok) {
      if (futureBooked.errorCode === "CANCEL_FAILED") {
        warnings.push(
          `Lezione #${future.sequenceNumber}: ${futureBooked.errorMessage}`,
        );
        continue;
      }

      const { error: unplaceError } = await client
        .from("lessons")
        .update({
          starts_at: null,
          ends_at: null,
          booking_id: null,
          room_id: futureRoomId,
          placement: "da_piazzare",
        })
        .eq("id", future.id);
      if (unplaceError) {
        warnings.push(
          `Lezione #${future.sequenceNumber}: ${unplaceError.message}`,
        );
      } else {
        warnings.push(
          `Lezione #${future.sequenceNumber}: ${futureBooked.errorMessage}`,
        );
      }
      continue;
    }

    const { error: futureUpdateError } = await client
      .from("lessons")
      .update({
        starts_at: futureStart,
        ends_at: futureEnd,
        room_id: futureRoomId,
        booking_id: futureBooked.bookingId,
        placement: "scheduled",
      })
      .eq("id", future.id);

    if (futureUpdateError) {
      if (futureBooked.bookingId) {
        await cancelHoldBooking(client, futureBooked.bookingId);
      }
      const { error: unplaceError } = await client
        .from("lessons")
        .update({
          starts_at: null,
          ends_at: null,
          booking_id: null,
          room_id: futureRoomId,
          placement: "da_piazzare",
        })
        .eq("id", future.id);
      warnings.push(
        `Lezione #${future.sequenceNumber}: ${futureUpdateError.message}`,
      );
      if (unplaceError) {
        warnings.push(
          `Lezione #${future.sequenceNumber}: ${unplaceError.message}`,
        );
      }
    }
  }

  void notifyLessonScheduleChange(client, {
    lessonId,
    kind: "moved",
    notifyTeachers: Boolean(input.actor?.isStaff),
  }).catch(() => undefined);

  return ok(lessonId, warnings);
}

export async function requestLessonMove(
  client: CalendarClient,
  input: RequestLessonMoveInput,
): Promise<CourseMutationResult> {
  if (input.lessonId.startsWith("hold:")) {
    return fail("Non si può richiedere lo spostamento di un hold.");
  }
  const startsMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startsMs)) {
    return fail("Data e ora della lezione non valide.");
  }
  if (input.scope !== "this" && input.scope !== "future") {
    return fail("Ambito di spostamento non valido.");
  }
  if (!input.createdBy.trim()) {
    return fail("Autore della richiesta mancante.");
  }

  const loaded = await loadLesson(client, input.lessonId);
  if (loaded.errorMessage) return fail(loaded.errorMessage);
  if (!loaded.lesson) return fail("Lezione non trovata.");

  const lesson = loaded.lesson;
  if (lesson.cancelledAt) {
    return fail("La lezione è stata annullata.");
  }
  if (lesson.placement !== "scheduled") {
    return fail("Si possono spostare solo le lezioni in calendario.");
  }

  const course = await getCourse(client, lesson.courseId);
  if (!course) {
    return fail("Corso non trovato.");
  }
  if (course.titularMemberId !== input.createdBy) {
    return fail("Puoi richiedere lo spostamento solo sui tuoi corsi.");
  }
  if (course.status !== "attivo" && course.status !== "in_attesa") {
    return fail("Si possono richiedere spostamenti solo per corsi attivi o in attesa.");
  }
  if (course.status === "in_attesa" && input.scope !== "this") {
    return fail("Su un corso in attesa si può richiedere solo questa lezione.");
  }

  const { data: pendingExisting, error: pendingError } = await client
    .from("lesson_change_requests")
    .select("id")
    .eq("lesson_id", lesson.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (pendingError) {
    return fail(
      pendingError.message || "Impossibile verificare le richieste aperte.",
    );
  }
  if (pendingExisting) {
    return fail("C'è già una richiesta di spostamento in coda per questa lezione.");
  }

  const startsAt = new Date(startsMs).toISOString();
  const endsAt = addMinutesIso(startsAt, course.durationMinutes);
  const roomId =
    course.courseKind === "online"
      ? null
      : (input.roomId ?? lesson.roomId ?? course.roomId);

  let holdBookingId: string | null = null;
  if (roomId) {
    const booked = await createLessonBooking(client, {
      roomId,
      memberId: course.titularMemberId,
      startAt: startsAt,
      endAt: endsAt,
      title: `Richiesta spostamento: ${course.name}`,
    });
    if (!booked.bookingId) {
      return fail(
        booked.errorCode === "SLOT_TAKEN"
          ? "Lo slot è già occupato."
          : booked.errorMessage || "Impossibile occupare la sala.",
      );
    }
    holdBookingId = booked.bookingId;
  }

  const { data, error } = await client
    .from("lesson_change_requests")
    .insert({
      lesson_id: lesson.id,
      course_id: course.id,
      requested_starts_at: startsAt,
      requested_room_id: roomId,
      scope: input.scope,
      note: input.note?.trim() || null,
      status: "pending",
      hold_booking_id: holdBookingId,
      created_by: input.createdBy,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (holdBookingId) {
      await cancelHoldBooking(client, holdBookingId);
    }
    return fail(error.message || "Impossibile inviare la richiesta.");
  }

  return ok(data?.id);
}
