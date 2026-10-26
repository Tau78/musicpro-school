import type { SupabaseClient } from "@supabase/supabase-js";

import { getRomeDayBoundsUtc, romeLocalInputToUtcIso } from "./bookings";
import {
  cancelHoldBooking,
  type CourseKind,
} from "./courses";
import { moveLesson } from "./lessons-calendar";
import { getTeacherProfile } from "./lessons-settings";
import { sendLessonFamilyEmail, sendSingleEmail } from "./messaging";
import {
  renderTeacherAbsenceEmail,
  type TeacherAbsenceEmailLessonLine,
} from "./teacher-absence-email";
import type { Database } from "./types/database";

type AbsenceClient = SupabaseClient<Database>;

const ROME = "Europe/Rome";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const TWELVE_HOURS_MS = 12 * 60 * 60_000;

const LESSON_COLUMNS =
  "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at";

const COURSE_COLUMNS =
  "id, name, course_kind, titular_member_id, duration_minutes, room_id, status, is_trial";

export type TeacherAbsenceLesson = {
  id: string;
  courseId: string;
  courseName: string;
  courseKind: CourseKind;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  roomName: string | null;
  studentNames: string[];
  hasAttendance: boolean;
  dateLabel: string;
  timeLabel: string;
};

export type TeacherAbsenceTarget = {
  lessonId: string;
  date: string;
  time: string;
  roomId: string | null;
};

export type TeacherAbsenceConflict = {
  lessonId: string;
  courseName: string;
  message: string;
};

export type TeacherAbsencePreview = {
  ok: boolean;
  conflicts: TeacherAbsenceConflict[];
  freeLessonIds: string[];
  blockedLessonIds: string[];
};

export type TeacherAbsenceApplyResult = {
  success: boolean;
  errorMessage?: string;
  cancelledIds: string[];
  movedIds: string[];
  leftIds: string[];
  conflicts: TeacherAbsenceConflict[];
  warnings: string[];
};

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];
type CourseRow = Pick<
  Database["public"]["Tables"]["courses"]["Row"],
  | "id"
  | "name"
  | "course_kind"
  | "titular_member_id"
  | "duration_minutes"
  | "room_id"
  | "status"
  | "is_trial"
>;

type LessonContext = {
  id: string;
  courseId: string;
  courseName: string;
  courseKind: CourseKind;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  roomName: string | null;
  bookingId: string | null;
  kind: LessonRow["kind"];
  makeupMemberId: string | null;
  studentNames: string[];
  familyMemberIds: string[];
  hasAttendance: boolean;
  dateLabel: string;
  timeLabel: string;
};

type ResolvedTarget = {
  lessonId: string;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
};

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB;
}

function lessonIntervalOverlaps(
  lessonStartsAt: string,
  lessonEndsAt: string | null,
  newStart: string,
  newEnd: string,
): boolean {
  if (lessonEndsAt) {
    return intervalsOverlap(lessonStartsAt, lessonEndsAt, newStart, newEnd);
  }
  const newEndMs = new Date(newEnd).getTime();
  const startsMs = new Date(lessonStartsAt).getTime();
  if (startsMs >= newEndMs) return false;
  if (startsMs < newEndMs - TWELVE_HOURS_MS) return false;
  return lessonStartsAt < newEnd && newEnd > newStart;
}

function studentLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function formatIsoDateIt(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatPeriodLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatIsoDateIt(fromDate);
  return `${formatIsoDateIt(fromDate)} – ${formatIsoDateIt(toDate)}`;
}

function romeDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function romeTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function whenLabelFromIso(iso: string): string {
  return `${romeDateLabel(iso)} alle ${romeTimeLabel(iso)}`;
}

function permissionError(
  actorMemberId: string,
  titularMemberId: string,
  isStaff: boolean,
): string | null {
  if (!isStaff && actorMemberId !== titularMemberId) {
    return "Puoi segnare assente solo te stesso.";
  }
  return null;
}

function validateDateRange(
  fromDate: string,
  toDate: string,
): string | null {
  if (!ISO_DATE_RE.test(fromDate) || !ISO_DATE_RE.test(toDate)) {
    return "Le date del periodo non sono valide.";
  }
  if (toDate < fromDate) {
    return "La data di fine deve essere successiva o uguale all'inizio.";
  }
  return null;
}

async function loadTitularCourseIds(
  client: AbsenceClient,
  titularMemberId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("courses")
    .select("id")
    .eq("titular_member_id", titularMemberId)
    .eq("status", "attivo");
  if (error) {
    throw new Error(error.message || "Impossibile caricare i corsi del docente.");
  }
  return (data ?? []).map((row) => row.id);
}

async function lessonIdsWithAttendance(
  client: AbsenceClient,
  lessonIds: string[],
): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const { data, error } = await client
    .from("lesson_attendances")
    .select("lesson_id")
    .in("lesson_id", lessonIds);
  if (error) {
    throw new Error(
      error.message || "Impossibile verificare le presenze.",
    );
  }
  return new Set((data ?? []).map((row) => row.lesson_id));
}

async function lessonIdsWithPayroll(
  client: AbsenceClient,
  lessonIds: string[],
): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const { data, error } = await client
    .from("lesson_payroll_lines")
    .select("lesson_id")
    .in("lesson_id", lessonIds);
  if (error) {
    throw new Error(
      error.message || "Impossibile verificare le notule.",
    );
  }
  return new Set(
    (data ?? [])
      .map((row) => row.lesson_id)
      .filter((id): id is string => Boolean(id)),
  );
}

async function loadLessonContexts(
  client: AbsenceClient,
  params: {
    courseIds: string[];
    startUtc: string;
    endUtc: string;
    lessonIds?: string[];
  },
): Promise<LessonContext[]> {
  if (params.courseIds.length === 0) return [];

  let query = client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .in("course_id", params.courseIds)
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .gte("starts_at", params.startUtc)
    .lt("starts_at", params.endUtc)
    .order("starts_at", { ascending: true });

  if (params.lessonIds?.length) {
    query = query.in("id", params.lessonIds);
  }

  const { data: lessonRows, error: lessonError } = await query;
  if (lessonError) {
    throw new Error(
      lessonError.message || "Impossibile caricare le lezioni.",
    );
  }
  if (!lessonRows?.length) return [];

  const courseIds = [...new Set(lessonRows.map((row) => row.course_id))];
  const { data: courseRows, error: courseError } = await client
    .from("courses")
    .select(COURSE_COLUMNS)
    .in("id", courseIds);
  if (courseError) {
    throw new Error(courseError.message || "Impossibile caricare i corsi.");
  }
  const coursesById = new Map(
    (courseRows ?? []).map((row) => [row.id, row as CourseRow]),
  );

  const roomIds = [
    ...new Set(
      lessonRows
        .map((row) => row.room_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roomById = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: rooms } = await client
      .from("rooms")
      .select("id, name")
      .in("id", roomIds);
    for (const room of rooms ?? []) {
      roomById.set(room.id, room.name);
    }
  }

  const { data: enrollments, error: enrollError } = await client
    .from("course_enrollments")
    .select("course_id, member_id")
    .in("course_id", courseIds)
    .is("left_at", null);
  if (enrollError) {
    throw new Error(
      enrollError.message || "Impossibile caricare gli iscritti.",
    );
  }

  const studentIds = [...new Set((enrollments ?? []).map((row) => row.member_id))];
  const studentsById = new Map<
    string,
    { first_name: string; last_name: string }
  >();
  if (studentIds.length > 0) {
    const { data: students, error: studentsError } = await client
      .from("members")
      .select("id, first_name, last_name")
      .in("id", studentIds);
    if (studentsError) {
      throw new Error(
        studentsError.message || "Impossibile caricare gli allievi.",
      );
    }
    for (const student of students ?? []) {
      studentsById.set(student.id, student);
    }
  }

  const studentsByCourse = new Map<string, string[]>();
  const familyIdsByCourse = new Map<string, string[]>();
  for (const enrollment of enrollments ?? []) {
    const student = studentsById.get(enrollment.member_id);
    if (!student) continue;
    const name = studentLabel(student.last_name, student.first_name);
    const names = studentsByCourse.get(enrollment.course_id) ?? [];
    names.push(name);
    studentsByCourse.set(enrollment.course_id, names);
    const ids = familyIdsByCourse.get(enrollment.course_id) ?? [];
    ids.push(enrollment.member_id);
    familyIdsByCourse.set(enrollment.course_id, ids);
  }
  for (const [courseId, names] of studentsByCourse) {
    names.sort((a, b) => a.localeCompare(b, "it"));
    studentsByCourse.set(courseId, names);
  }

  const lessonIds = lessonRows.map((row) => row.id);
  const attended = await lessonIdsWithAttendance(client, lessonIds);

  return lessonRows
    .filter((row) => coursesById.has(row.course_id))
    .map((row) => {
      const course = coursesById.get(row.course_id)!;
      const startsAt = row.starts_at!;
      let studentNames = studentsByCourse.get(course.id) ?? [];
      let familyMemberIds = familyIdsByCourse.get(course.id) ?? [];
      if (row.kind === "recupero" && row.makeup_member_id) {
        const makeup = studentsById.get(row.makeup_member_id);
        studentNames = makeup
          ? [studentLabel(makeup.last_name, makeup.first_name)]
          : [];
        familyMemberIds = [row.makeup_member_id];
      }
      return {
        id: row.id,
        courseId: course.id,
        courseName: course.name,
        courseKind: course.course_kind,
        durationMinutes: course.duration_minutes,
        startsAt,
        endsAt: row.ends_at ?? addMinutesIso(startsAt, course.duration_minutes),
        roomId: row.room_id,
        roomName: row.room_id ? roomById.get(row.room_id) ?? null : null,
        bookingId: row.booking_id,
        kind: row.kind,
        makeupMemberId: row.makeup_member_id,
        studentNames,
        familyMemberIds,
        hasAttendance: attended.has(row.id),
        dateLabel: new Intl.DateTimeFormat("en-CA", {
          timeZone: ROME,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(startsAt)),
        timeLabel: romeTimeLabel(startsAt),
      };
    });
}

function toPublicLesson(ctx: LessonContext): TeacherAbsenceLesson {
  return {
    id: ctx.id,
    courseId: ctx.courseId,
    courseName: ctx.courseName,
    courseKind: ctx.courseKind,
    startsAt: ctx.startsAt,
    endsAt: ctx.endsAt,
    roomId: ctx.roomId,
    roomName: ctx.roomName,
    studentNames: ctx.studentNames,
    hasAttendance: ctx.hasAttendance,
    dateLabel: ctx.dateLabel,
    timeLabel: ctx.timeLabel,
  };
}

async function loadLessonsByIds(
  client: AbsenceClient,
  courseIds: string[],
  lessonIds: string[],
): Promise<Map<string, LessonContext>> {
  if (lessonIds.length === 0 || courseIds.length === 0) {
    return new Map();
  }
  const { data: lessonRows, error } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .in("id", lessonIds)
    .in("course_id", courseIds)
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .not("starts_at", "is", null);
  if (error) {
    throw new Error(error.message || "Impossibile caricare le lezioni.");
  }
  if (!lessonRows?.length) return new Map();

  const visibleCourseIds = [
    ...new Set(lessonRows.map((row) => row.course_id)),
  ];
  const { data: courseRows, error: courseError } = await client
    .from("courses")
    .select(COURSE_COLUMNS)
    .in("id", visibleCourseIds)
    .eq("status", "attivo");
  if (courseError) {
    throw new Error(courseError.message || "Impossibile caricare i corsi.");
  }
  const coursesById = new Map(
    (courseRows ?? []).map((row) => [row.id, row as CourseRow]),
  );

  const filteredRows = lessonRows.filter((row) => coursesById.has(row.course_id));
  if (filteredRows.length === 0) return new Map();

  const roomIds = [
    ...new Set(
      filteredRows
        .map((row) => row.room_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roomById = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: rooms } = await client
      .from("rooms")
      .select("id, name")
      .in("id", roomIds);
    for (const room of rooms ?? []) {
      roomById.set(room.id, room.name);
    }
  }

  const { data: enrollments, error: enrollError } = await client
    .from("course_enrollments")
    .select("course_id, member_id")
    .in("course_id", visibleCourseIds)
    .is("left_at", null);
  if (enrollError) {
    throw new Error(
      enrollError.message || "Impossibile caricare gli iscritti.",
    );
  }

  const studentIds = [...new Set((enrollments ?? []).map((row) => row.member_id))];
  const studentsById = new Map<
    string,
    { first_name: string; last_name: string }
  >();
  if (studentIds.length > 0) {
    const { data: students } = await client
      .from("members")
      .select("id, first_name, last_name")
      .in("id", studentIds);
    for (const student of students ?? []) {
      studentsById.set(student.id, student);
    }
  }

  const studentsByCourse = new Map<string, string[]>();
  const familyIdsByCourse = new Map<string, string[]>();
  for (const enrollment of enrollments ?? []) {
    const student = studentsById.get(enrollment.member_id);
    if (!student) continue;
    const name = studentLabel(student.last_name, student.first_name);
    const names = studentsByCourse.get(enrollment.course_id) ?? [];
    names.push(name);
    studentsByCourse.set(enrollment.course_id, names);
    const ids = familyIdsByCourse.get(enrollment.course_id) ?? [];
    ids.push(enrollment.member_id);
    familyIdsByCourse.set(enrollment.course_id, ids);
  }

  const attended = await lessonIdsWithAttendance(
    client,
    filteredRows.map((row) => row.id),
  );

  const contexts: LessonContext[] = filteredRows.map((row) => {
    const course = coursesById.get(row.course_id)!;
    const startsAt = row.starts_at!;
    let studentNames = studentsByCourse.get(course.id) ?? [];
    let familyMemberIds = familyIdsByCourse.get(course.id) ?? [];
    if (row.kind === "recupero" && row.makeup_member_id) {
      const makeup = studentsById.get(row.makeup_member_id);
      studentNames = makeup
        ? [studentLabel(makeup.last_name, makeup.first_name)]
        : [];
      familyMemberIds = [row.makeup_member_id];
    }
    return {
      id: row.id,
      courseId: course.id,
      courseName: course.name,
      courseKind: course.course_kind,
      durationMinutes: course.duration_minutes,
      startsAt,
      endsAt: row.ends_at ?? addMinutesIso(startsAt, course.duration_minutes),
      roomId: row.room_id,
      roomName: row.room_id ? roomById.get(row.room_id) ?? null : null,
      bookingId: row.booking_id,
      kind: row.kind,
      makeupMemberId: row.makeup_member_id,
      studentNames,
      familyMemberIds,
      hasAttendance: attended.has(row.id),
      dateLabel: new Intl.DateTimeFormat("en-CA", {
        timeZone: ROME,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(startsAt)),
      timeLabel: romeTimeLabel(startsAt),
    };
  });

  return new Map(contexts.map((ctx) => [ctx.id, ctx]));
}

function resolveTarget(
  target: TeacherAbsenceTarget,
  ctx: LessonContext,
): ResolvedTarget | { error: string } {
  if (!ISO_DATE_RE.test(target.date) || !TIME_RE.test(target.time)) {
    return { error: "Data o ora di destinazione non valide." };
  }
  const startsAt = romeLocalInputToUtcIso(`${target.date}T${target.time}`);
  const endsAt = addMinutesIso(startsAt, ctx.durationMinutes);
  const roomId =
    ctx.courseKind === "online"
      ? null
      : target.roomId ?? ctx.roomId;
  if (ctx.courseKind !== "online" && !roomId) {
    return { error: "Sala obbligatoria." };
  }
  return { lessonId: target.lessonId, startsAt, endsAt, roomId };
}

async function findRoomBookingConflict(
  client: AbsenceClient,
  params: {
    roomId: string;
    startsAt: string;
    endsAt: string;
    excludeBookingIds: Set<string>;
    roomName: string;
  },
): Promise<string | null> {
  const { data, error } = await client
    .from("bookings")
    .select("id, start_at, end_at, status, cancelled_at")
    .eq("room_id", params.roomId)
    .lt("start_at", params.endsAt)
    .gt("end_at", params.startsAt)
    .neq("status", "cancelled");
  if (error) {
    throw new Error(
      error.message || "Impossibile verificare la disponibilità della sala.",
    );
  }
  const conflicts = (data ?? []).filter((row) => {
    if (params.excludeBookingIds.has(row.id)) return false;
    if (row.status === "cancelled") return false;
    if (row.cancelled_at) return false;
    return intervalsOverlap(
      row.start_at,
      row.end_at,
      params.startsAt,
      params.endsAt,
    );
  });
  if (conflicts.length === 0) return null;
  const hit = conflicts[0]!;
  const when = whenLabelFromIso(hit.start_at);
  return `Sala ${params.roomName} occupata il ${when}.`;
}

async function findTeacherLessonConflict(
  client: AbsenceClient,
  params: {
    titularMemberId: string;
    startsAt: string;
    endsAt: string;
    lessonId: string;
    batchLessonIds: Set<string>;
  },
): Promise<boolean> {
  const { data: overlapping, error } = await client
    .from("lessons")
    .select("id, course_id, starts_at, ends_at")
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .lt("starts_at", params.endsAt)
    .or(`ends_at.gt.${params.startsAt},ends_at.is.null`)
    .neq("id", params.lessonId);
  if (error) {
    throw new Error(
      error.message || "Impossibile verificare le sovrapposizioni docente.",
    );
  }
  const candidates = (overlapping ?? []).filter((row) => {
    if (params.batchLessonIds.has(row.id)) return false;
    if (!row.starts_at) return false;
    return lessonIntervalOverlaps(
      row.starts_at,
      row.ends_at,
      params.startsAt,
      params.endsAt,
    );
  });
  if (candidates.length === 0) return false;

  const courseIds = [...new Set(candidates.map((row) => row.course_id))];
  const { data: courses, error: courseError } = await client
    .from("courses")
    .select("id, titular_member_id")
    .in("id", courseIds);
  if (courseError) {
    throw new Error(
      courseError.message || "Impossibile caricare i corsi in conflitto.",
    );
  }
  return (courses ?? []).some(
    (row) => row.titular_member_id === params.titularMemberId,
  );
}

async function findStudentLessonConflict(
  client: AbsenceClient,
  params: {
    familyMemberIds: string[];
    startsAt: string;
    endsAt: string;
    lessonId: string;
    excludeLessonIds: Set<string>;
  },
): Promise<boolean> {
  if (params.familyMemberIds.length === 0) return false;

  const { data: overlapping, error } = await client
    .from("lessons")
    .select("id, course_id, starts_at, ends_at")
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .lt("starts_at", params.endsAt)
    .or(`ends_at.gt.${params.startsAt},ends_at.is.null`);
  if (error) {
    throw new Error(
      error.message || "Impossibile verificare le sovrapposizioni allievi.",
    );
  }

  const candidates = (overlapping ?? []).filter((row) => {
    if (row.id === params.lessonId) return false;
    if (params.excludeLessonIds.has(row.id)) return false;
    if (!row.starts_at) return false;
    return lessonIntervalOverlaps(
      row.starts_at,
      row.ends_at,
      params.startsAt,
      params.endsAt,
    );
  });
  if (candidates.length === 0) return false;

  const courseIds = [...new Set(candidates.map((row) => row.course_id))];
  const { data: enrollments, error: enrollError } = await client
    .from("course_enrollments")
    .select("course_id, member_id")
    .in("course_id", courseIds)
    .in("member_id", params.familyMemberIds)
    .is("left_at", null);
  if (enrollError) {
    throw new Error(
      enrollError.message || "Impossibile verificare gli iscritti in conflitto.",
    );
  }
  return (enrollments ?? []).length > 0;
}

function batchIntervalConflict(
  lessonId: string,
  resolved: ResolvedTarget,
  others: Map<string, ResolvedTarget>,
): string | null {
  for (const [otherId, other] of others) {
    if (otherId === lessonId) continue;
    if (
      intervalsOverlap(
        resolved.startsAt,
        resolved.endsAt,
        other.startsAt,
        other.endsAt,
      )
    ) {
      return "Le lezioni spostate si sovrappongono tra loro.";
    }
  }
  return null;
}

async function buildMovePreview(
  client: AbsenceClient,
  params: {
    titularMemberId: string;
    targets: TeacherAbsenceTarget[];
    contexts: Map<string, LessonContext>;
    roomNames: Map<string, string>;
  },
): Promise<TeacherAbsencePreview> {
  const conflicts: TeacherAbsenceConflict[] = [];
  const blocked = new Set<string>();
  const batchIds = new Set(params.targets.map((t) => t.lessonId));

  const payrollIds = await lessonIdsWithPayroll(
    client,
    [...batchIds],
  );
  const resolvedByLesson = new Map<string, ResolvedTarget>();

  for (const target of params.targets) {
    const ctx = params.contexts.get(target.lessonId);
    if (!ctx) {
      conflicts.push({
        lessonId: target.lessonId,
        courseName: "—",
        message: "Lezione non trovata o non modificabile.",
      });
      blocked.add(target.lessonId);
      continue;
    }
    if (ctx.hasAttendance) {
      conflicts.push({
        lessonId: ctx.id,
        courseName: ctx.courseName,
        message: "Lezione già presenziata.",
      });
      blocked.add(ctx.id);
      continue;
    }
    if (payrollIds.has(ctx.id)) {
      conflicts.push({
        lessonId: ctx.id,
        courseName: ctx.courseName,
        message: "Compenso già in notula.",
      });
      blocked.add(ctx.id);
      continue;
    }

    const resolved = resolveTarget(target, ctx);
    if ("error" in resolved) {
      conflicts.push({
        lessonId: ctx.id,
        courseName: ctx.courseName,
        message: resolved.error,
      });
      blocked.add(ctx.id);
      continue;
    }
    resolvedByLesson.set(ctx.id, resolved);
  }

  const movableBookingIds = new Set<string>();
  for (const lessonId of resolvedByLesson.keys()) {
    const ctx = params.contexts.get(lessonId);
    if (ctx?.bookingId) movableBookingIds.add(ctx.bookingId);
  }
  const movingLessonIds = new Set(resolvedByLesson.keys());

  for (const target of params.targets) {
    if (blocked.has(target.lessonId)) continue;
    const ctx = params.contexts.get(target.lessonId)!;
    const resolved = resolvedByLesson.get(ctx.id)!;

    const batchMsg = batchIntervalConflict(
      ctx.id,
      resolved,
      resolvedByLesson,
    );
    if (batchMsg) {
      conflicts.push({
        lessonId: ctx.id,
        courseName: ctx.courseName,
        message: batchMsg,
      });
      blocked.add(ctx.id);
      continue;
    }

    if (resolved.roomId) {
      const roomName =
        params.roomNames.get(resolved.roomId) ??
        ctx.roomName ??
        "Sala";
      const roomMsg = await findRoomBookingConflict(client, {
        roomId: resolved.roomId,
        startsAt: resolved.startsAt,
        endsAt: resolved.endsAt,
        excludeBookingIds: movableBookingIds,
        roomName,
      });
      if (roomMsg) {
        conflicts.push({
          lessonId: ctx.id,
          courseName: ctx.courseName,
          message: roomMsg,
        });
        blocked.add(ctx.id);
        continue;
      }
    }

    const teacherConflict = await findTeacherLessonConflict(client, {
      titularMemberId: params.titularMemberId,
      startsAt: resolved.startsAt,
      endsAt: resolved.endsAt,
      lessonId: ctx.id,
      batchLessonIds: movingLessonIds,
    });
    if (teacherConflict) {
      conflicts.push({
        lessonId: ctx.id,
        courseName: ctx.courseName,
        message: "Il docente ha già una lezione in questo orario.",
      });
      blocked.add(ctx.id);
      continue;
    }

    const studentConflict = await findStudentLessonConflict(client, {
      familyMemberIds: ctx.familyMemberIds,
      startsAt: resolved.startsAt,
      endsAt: resolved.endsAt,
      lessonId: ctx.id,
      excludeLessonIds: movingLessonIds,
    });
    if (studentConflict) {
      conflicts.push({
        lessonId: ctx.id,
        courseName: ctx.courseName,
        message: "Uno o più allievi hanno già una lezione in questo orario.",
      });
      blocked.add(ctx.id);
    }
  }

  const freeLessonIds = params.targets
    .map((t) => t.lessonId)
    .filter((id) => !blocked.has(id));
  const blockedLessonIds = [...blocked];
  return {
    ok: blockedLessonIds.length === 0,
    conflicts,
    freeLessonIds,
    blockedLessonIds,
  };
}

async function ensureCanReschedule(
  client: AbsenceClient,
  actorMemberId: string,
  isStaff: boolean,
): Promise<string | null> {
  if (isStaff) return null;
  const profile = await getTeacherProfile(client, actorMemberId);
  if (!profile?.canReschedule) {
    return "Non hai il permesso di spostare le lezioni. Puoi solo annullarle.";
  }
  return null;
}

async function loadRoomNames(
  client: AbsenceClient,
  roomIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(roomIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await client.from("rooms").select("id, name").in("id", unique);
  for (const row of data ?? []) {
    map.set(row.id, row.name);
  }
  return map;
}

async function listStaffEmails(
  client: AbsenceClient,
): Promise<{ emails: string[]; rpcFailed: boolean }> {
  const { data, error } = await client.rpc("list_lesson_staff_emails");
  if (error) return { emails: [], rpcFailed: true };
  const emails = (data ?? [])
    .map((row) => row.email?.trim() ?? "")
    .filter(Boolean);
  return { emails, rpcFailed: false };
}

async function loadTeacherName(
  client: AbsenceClient,
  memberId: string,
): Promise<string> {
  const { data } = await client
    .from("members")
    .select("first_name, last_name")
    .eq("id", memberId)
    .maybeSingle();
  if (!data) return "Docente";
  return `${data.first_name} ${data.last_name}`.trim() || "Docente";
}

type NotifyLessonSnapshot = {
  lessonId: string;
  courseName: string;
  originalWhen: string;
  originalRoom: string | null;
  newWhen?: string;
  newRoom?: string | null;
  familyMemberIds: string[];
};

async function sendAbsenceNotifications(
  client: AbsenceClient,
  params: {
    kind: "cancelled" | "moved";
    fromDate: string;
    toDate: string;
    titularMemberId: string;
    notifySegreteria: boolean;
    notifyFamily: boolean;
    lessons: NotifyLessonSnapshot[];
  },
): Promise<string[]> {
  if (!params.notifySegreteria && !params.notifyFamily) return [];
  if (params.lessons.length === 0) return [];

  const warnings: string[] = [];
  const periodLabel = formatPeriodLabel(params.fromDate, params.toDate);
  const teacherName = await loadTeacherName(client, params.titularMemberId);

  if (params.notifySegreteria) {
    const lines: TeacherAbsenceEmailLessonLine[] = params.lessons.map((l) => ({
      courseName: l.courseName,
      originalWhen: l.originalWhen,
      originalRoom: l.originalRoom,
      newWhen: l.newWhen,
      newRoom: l.newRoom,
    }));
    const mail = renderTeacherAbsenceEmail({
      kind: params.kind,
      periodLabel,
      teacherName,
      lessons: lines,
      audience: "staff",
    });
    const { emails: recipients, rpcFailed } = await listStaffEmails(client);
    if (rpcFailed || recipients.length === 0) {
      warnings.push("Segreteria non avvisata: nessun destinatario.");
    }
    for (const to of recipients) {
      const result = await sendSingleEmail(client, {
        to,
        subject: mail.subject,
        body: mail.text,
        html: mail.html,
      });
      if (!result.ok) {
        warnings.push(result.error);
      }
    }
  }

  if (params.notifyFamily) {
    const byMember = new Map<string, NotifyLessonSnapshot[]>();
    for (const lesson of params.lessons) {
      for (const memberId of lesson.familyMemberIds) {
        const list = byMember.get(memberId) ?? [];
        list.push(lesson);
        byMember.set(memberId, list);
      }
    }
    for (const [memberId, memberLessons] of byMember) {
      const lines: TeacherAbsenceEmailLessonLine[] = memberLessons.map((l) => ({
        courseName: l.courseName,
        originalWhen: l.originalWhen,
        originalRoom: l.originalRoom,
        newWhen: l.newWhen,
        newRoom: l.newRoom,
      }));
      const mail = renderTeacherAbsenceEmail({
        kind: params.kind,
        periodLabel,
        lessons: lines,
        audience: "family",
      });
      const result = await sendLessonFamilyEmail(client, memberId, {
        subject: mail.subject,
        body: mail.text,
        html: mail.html,
      });
      warnings.push(...result.warnings);
      if (result.skipped > 0 && result.sent === 0) {
        warnings.push("Email famiglia non inviata (destinatario assente o Resend).");
      }
    }
  }

  return warnings;
}

export async function listTeacherAbsenceLessons(
  client: AbsenceClient,
  input: {
    titularMemberId: string;
    fromDate: string;
    toDate: string;
    actorMemberId: string;
    isStaff: boolean;
  },
): Promise<{ lessons: TeacherAbsenceLesson[] } | { errorMessage: string }> {
  const perm = permissionError(
    input.actorMemberId,
    input.titularMemberId,
    input.isStaff,
  );
  if (perm) return { errorMessage: perm };
  const rangeError = validateDateRange(input.fromDate, input.toDate);
  if (rangeError) return { errorMessage: rangeError };

  try {
    const courseIds = await loadTitularCourseIds(client, input.titularMemberId);
    const { startUtc } = getRomeDayBoundsUtc(input.fromDate);
    const { endUtc } = getRomeDayBoundsUtc(input.toDate);
    const contexts = await loadLessonContexts(client, {
      courseIds,
      startUtc,
      endUtc,
    });
    return { lessons: contexts.map(toPublicLesson) };
  } catch (err) {
    return {
      errorMessage:
        err instanceof Error ? err.message : "Impossibile caricare le lezioni.",
    };
  }
}

export async function previewTeacherAbsenceMove(
  client: AbsenceClient,
  input: {
    titularMemberId: string;
    actorMemberId: string;
    isStaff: boolean;
    targets: TeacherAbsenceTarget[];
  },
): Promise<TeacherAbsencePreview | { errorMessage: string }> {
  const perm = permissionError(
    input.actorMemberId,
    input.titularMemberId,
    input.isStaff,
  );
  if (perm) return { errorMessage: perm };

  try {
    const rescheduleError = await ensureCanReschedule(
      client,
      input.actorMemberId,
      input.isStaff,
    );
    if (rescheduleError) return { errorMessage: rescheduleError };

    if (input.targets.length === 0) {
      return { ok: true, conflicts: [], freeLessonIds: [], blockedLessonIds: [] };
    }

    const courseIds = await loadTitularCourseIds(client, input.titularMemberId);
    const lessonIds = input.targets.map((t) => t.lessonId);
    const contexts = await loadLessonsByIds(client, courseIds, lessonIds);
    const roomIds = input.targets
      .map((t) => t.roomId)
      .filter((id): id is string => Boolean(id));
    const roomNames = await loadRoomNames(client, roomIds);

    return await buildMovePreview(client, {
      titularMemberId: input.titularMemberId,
      targets: input.targets,
      contexts,
      roomNames,
    });
  } catch (err) {
    return {
      errorMessage:
        err instanceof Error ? err.message : "Impossibile verificare lo spostamento.",
    };
  }
}

export async function cancelTeacherAbsence(
  client: AbsenceClient,
  input: {
    titularMemberId: string;
    actorMemberId: string;
    isStaff: boolean;
    fromDate: string;
    toDate: string;
    lessonIds: string[];
    notifySegreteria: boolean;
    notifyFamily: boolean;
  },
): Promise<TeacherAbsenceApplyResult> {
  const empty: TeacherAbsenceApplyResult = {
    success: false,
    cancelledIds: [],
    movedIds: [],
    leftIds: [],
    conflicts: [],
    warnings: [],
  };

  const perm = permissionError(
    input.actorMemberId,
    input.titularMemberId,
    input.isStaff,
  );
  if (perm) return { ...empty, errorMessage: perm };
  const rangeError = validateDateRange(input.fromDate, input.toDate);
  if (rangeError) return { ...empty, errorMessage: rangeError };

  const requested = new Set(input.lessonIds);
  if (requested.size === 0) {
    return { ...empty, errorMessage: "Nessuna lezione selezionata." };
  }

  try {
    const courseIds = await loadTitularCourseIds(client, input.titularMemberId);
    const { startUtc } = getRomeDayBoundsUtc(input.fromDate);
    const { endUtc } = getRomeDayBoundsUtc(input.toDate);
    const contexts = await loadLessonContexts(client, {
      courseIds,
      startUtc,
      endUtc,
      lessonIds: [...requested],
    });
    const byId = new Map(contexts.map((c) => [c.id, c]));
    const payrollIds = await lessonIdsWithPayroll(client, [...requested]);

    const cancelledIds: string[] = [];
    const leftIds: string[] = [];
    const conflicts: TeacherAbsenceConflict[] = [];
    const notifySnapshots: NotifyLessonSnapshot[] = [];
    const warnings: string[] = [];

    for (const lessonId of input.lessonIds) {
      const ctx = byId.get(lessonId);
      if (!ctx) {
        leftIds.push(lessonId);
        continue;
      }
      if (ctx.hasAttendance) {
        conflicts.push({
          lessonId,
          courseName: ctx.courseName,
          message: "Lezione già presenziata.",
        });
        leftIds.push(lessonId);
        continue;
      }
      if (payrollIds.has(lessonId)) {
        conflicts.push({
          lessonId,
          courseName: ctx.courseName,
          message: "Compenso già in notula.",
        });
        leftIds.push(lessonId);
        continue;
      }

      const { data: fresh, error: freshError } = await client
        .from("lessons")
        .select("id, booking_id, placement, cancelled_at")
        .eq("id", lessonId)
        .maybeSingle();
      if (freshError || !fresh) {
        leftIds.push(lessonId);
        continue;
      }

      const { data: cancelledRows, error: updateError } = await client
        .from("lessons")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", lessonId)
        .eq("placement", "scheduled")
        .is("cancelled_at", null)
        .select("id");

      if (updateError) {
        conflicts.push({
          lessonId,
          courseName: ctx.courseName,
          message: updateError.message || "Impossibile annullare la lezione.",
        });
        leftIds.push(lessonId);
        continue;
      }
      if (!cancelledRows?.length) {
        leftIds.push(lessonId);
        continue;
      }

      const bookingId = fresh.booking_id;
      if (bookingId) {
        const cancelError = await cancelHoldBooking(client, bookingId);
        if (cancelError) {
          const { error: rollbackError } = await client
            .from("lessons")
            .update({ cancelled_at: null })
            .eq("id", lessonId)
            .eq("placement", "scheduled")
            .not("cancelled_at", "is", null);
          if (rollbackError) {
            conflicts.push({
              lessonId,
              courseName: ctx.courseName,
              message:
                rollbackError.message ||
                "Annullamento non ripristinato dopo errore sala.",
            });
          } else {
            conflicts.push({
              lessonId,
              courseName: ctx.courseName,
              message: cancelError,
            });
          }
          leftIds.push(lessonId);
          continue;
        }

        const { error: clearBookingError } = await client
          .from("lessons")
          .update({ booking_id: null })
          .eq("id", lessonId);
        if (clearBookingError) {
          warnings.push(
            `Lezione annullata ma il riferimento sala non è stato aggiornato (${ctx.courseName}).`,
          );
        }
      }

      cancelledIds.push(lessonId);
      notifySnapshots.push({
        lessonId,
        courseName: ctx.courseName,
        originalWhen: whenLabelFromIso(ctx.startsAt),
        originalRoom:
          ctx.courseKind === "online"
            ? "online"
            : ctx.roomName,
        familyMemberIds: ctx.familyMemberIds,
      });
    }

    warnings.push(
      ...(await sendAbsenceNotifications(client, {
        kind: "cancelled",
        fromDate: input.fromDate,
        toDate: input.toDate,
        titularMemberId: input.titularMemberId,
        notifySegreteria: input.notifySegreteria,
        notifyFamily: input.notifyFamily,
        lessons: notifySnapshots,
      })),
    );

    if (cancelledIds.length === 0 && input.lessonIds.length > 0) {
      return {
        success: false,
        cancelledIds,
        movedIds: [],
        leftIds,
        conflicts,
        warnings,
        errorMessage: "Nessuna lezione annullata.",
      };
    }

    return {
      success: true,
      cancelledIds,
      movedIds: [],
      leftIds,
      conflicts,
      warnings,
    };
  } catch (err) {
    return {
      ...empty,
      errorMessage:
        err instanceof Error ? err.message : "Impossibile annullare le lezioni.",
    };
  }
}

type MoveLessonActor = {
  memberId: string;
  isStaff: boolean;
  canReschedule: boolean;
};

async function rollbackMovedLessons(
  client: AbsenceClient,
  snapshots: Array<{
    lessonId: string;
    startsAt: string;
    roomId: string | null;
  }>,
  actor: MoveLessonActor,
  contexts: Map<string, LessonContext>,
): Promise<{ warnings: string[]; unrestoredCourseNames: string[] }> {
  const warnings: string[] = [];
  const unrestoredCourseNames: string[] = [];

  for (const snap of [...snapshots].reverse()) {
    const undoOnce = () =>
      moveLesson(client, snap.lessonId, {
        startsAt: snap.startsAt,
        roomId: snap.roomId,
        scope: "this",
        notifyFamily: false,
        notifyTeacher: false,
        actor,
      });

    let undo = await undoOnce();
    if (!undo.success) {
      undo = await undoOnce();
    }
    if (!undo.success) {
      const ctx = contexts.get(snap.lessonId);
      unrestoredCourseNames.push(ctx?.courseName ?? snap.lessonId);
      warnings.push(
        undo.errorMessage ||
          `Rollback non riuscito per ${ctx?.courseName ?? "la lezione"}.`,
      );
    }
  }

  return { warnings, unrestoredCourseNames };
}

function rollbackAllPolicyErrorMessage(unrestoredCourseNames: string[]): string {
  if (unrestoredCourseNames.length === 0) {
    return "Spostamento annullato per conflitto a metà percorso.";
  }
  const names = [...new Set(unrestoredCourseNames)].join(", ");
  return `Spostamento annullato: impossibile ripristinare ${names}.`;
}

export async function moveTeacherAbsence(
  client: AbsenceClient,
  input: {
    titularMemberId: string;
    actorMemberId: string;
    isStaff: boolean;
    fromDate: string;
    toDate: string;
    targets: TeacherAbsenceTarget[];
    conflictPolicy: "all" | "partial";
    notifySegreteria: boolean;
    notifyFamily: boolean;
  },
): Promise<TeacherAbsenceApplyResult> {
  const empty: TeacherAbsenceApplyResult = {
    success: false,
    cancelledIds: [],
    movedIds: [],
    leftIds: [],
    conflicts: [],
    warnings: [],
  };

  const perm = permissionError(
    input.actorMemberId,
    input.titularMemberId,
    input.isStaff,
  );
  if (perm) return { ...empty, errorMessage: perm };
  const rangeError = validateDateRange(input.fromDate, input.toDate);
  if (rangeError) return { ...empty, errorMessage: rangeError };

  try {
    const rescheduleError = await ensureCanReschedule(
      client,
      input.actorMemberId,
      input.isStaff,
    );
    if (rescheduleError) return { ...empty, errorMessage: rescheduleError };

    if (input.targets.length === 0) {
      return { ...empty, errorMessage: "Nessuna lezione da spostare." };
    }

    const courseIds = await loadTitularCourseIds(client, input.titularMemberId);
    const { startUtc } = getRomeDayBoundsUtc(input.fromDate);
    const { endUtc } = getRomeDayBoundsUtc(input.toDate);
    const lessonIds = input.targets.map((t) => t.lessonId);
    const inRangeContexts = await loadLessonContexts(client, {
      courseIds,
      startUtc,
      endUtc,
      lessonIds,
    });
    const contexts = new Map(inRangeContexts.map((c) => [c.id, c]));

    const missingInRange = input.targets.filter((t) => !contexts.has(t.lessonId));
    if (missingInRange.length > 0) {
      return {
        ...empty,
        errorMessage: "Una o più lezioni non sono nel periodo indicato.",
        leftIds: missingInRange.map((t) => t.lessonId),
      };
    }

    const roomIds = input.targets
      .map((t) => t.roomId)
      .filter((id): id is string => Boolean(id));
    const roomNames = await loadRoomNames(client, roomIds);

    const preview = await buildMovePreview(client, {
      titularMemberId: input.titularMemberId,
      targets: input.targets,
      contexts,
      roomNames,
    });

    if (input.conflictPolicy === "all" && !preview.ok) {
      return {
        success: false,
        cancelledIds: [],
        movedIds: [],
        leftIds: preview.blockedLessonIds,
        conflicts: preview.conflicts,
        warnings: [],
        errorMessage: "Ci sono conflitti: nessuna lezione spostata.",
      };
    }

    const toMove =
      input.conflictPolicy === "all"
        ? preview.freeLessonIds
        : preview.freeLessonIds;

    if (toMove.length === 0) {
      return {
        success: false,
        cancelledIds: [],
        movedIds: [],
        leftIds: preview.blockedLessonIds,
        conflicts: preview.conflicts,
        warnings: [],
        errorMessage: "Nessuna lezione spostabile.",
      };
    }

    const targetByLesson = new Map(
      input.targets.map((t) => [t.lessonId, t]),
    );

    let canReschedule = true;
    if (!input.isStaff) {
      const profile = await getTeacherProfile(client, input.actorMemberId);
      canReschedule = profile?.canReschedule ?? false;
    }

    const movedIds: string[] = [];
    const leftIds = [...preview.blockedLessonIds];
    const conflicts = [...preview.conflicts];
    const warnings: string[] = [];
    const rollbackSnapshots: Array<{
      lessonId: string;
      startsAt: string;
      roomId: string | null;
    }> = [];
    const notifySnapshots: NotifyLessonSnapshot[] = [];

    for (const lessonId of toMove) {
      const ctx = contexts.get(lessonId)!;
      const target = targetByLesson.get(lessonId)!;
      const resolved = resolveTarget(target, ctx);
      if ("error" in resolved) {
        leftIds.push(lessonId);
        conflicts.push({
          lessonId,
          courseName: ctx.courseName,
          message: resolved.error,
        });
        if (input.conflictPolicy === "all") {
          const rollback = await rollbackMovedLessons(
            client,
            rollbackSnapshots,
            {
              memberId: input.actorMemberId,
              isStaff: input.isStaff,
              canReschedule,
            },
            contexts,
          );
          warnings.push(...rollback.warnings);
          return {
            success: false,
            cancelledIds: [],
            movedIds: [],
            leftIds: [...new Set([...leftIds, ...toMove])],
            conflicts,
            warnings,
            errorMessage: rollbackAllPolicyErrorMessage(
              rollback.unrestoredCourseNames,
            ),
          };
        }
        warnings.push(`Lezione non spostata: ${resolved.error}`);
        continue;
      }

      const originalStartsAt = ctx.startsAt;
      const originalRoomId = ctx.roomId;
      rollbackSnapshots.push({
        lessonId,
        startsAt: originalStartsAt,
        roomId: originalRoomId,
      });

      const result = await moveLesson(client, lessonId, {
        startsAt: resolved.startsAt,
        roomId: resolved.roomId,
        scope: "this",
        notifyFamily: false,
        notifyTeacher: false,
        actor: {
          memberId: input.actorMemberId,
          isStaff: input.isStaff,
          canReschedule,
        },
      });

      if (!result.success) {
        rollbackSnapshots.pop();
        leftIds.push(lessonId);
        const message =
          result.errorMessage || "Impossibile spostare la lezione.";
        conflicts.push({
          lessonId,
          courseName: ctx.courseName,
          message,
        });

        if (input.conflictPolicy === "all") {
          const rollback = await rollbackMovedLessons(
            client,
            rollbackSnapshots,
            {
              memberId: input.actorMemberId,
              isStaff: input.isStaff,
              canReschedule,
            },
            contexts,
          );
          warnings.push(...rollback.warnings);
          return {
            success: false,
            cancelledIds: [],
            movedIds: [],
            leftIds: [...new Set([...leftIds, ...preview.freeLessonIds])],
            conflicts,
            warnings,
            errorMessage: rollbackAllPolicyErrorMessage(
              rollback.unrestoredCourseNames,
            ),
          };
        }
        warnings.push(message);
        continue;
      }

      movedIds.push(lessonId);
      const newRoomName =
        resolved.roomId
          ? roomNames.get(resolved.roomId) ?? ctx.roomName
          : ctx.courseKind === "online"
            ? "online"
            : null;
      notifySnapshots.push({
        lessonId,
        courseName: ctx.courseName,
        originalWhen: whenLabelFromIso(originalStartsAt),
        originalRoom:
          ctx.courseKind === "online" ? "online" : ctx.roomName,
        newWhen: whenLabelFromIso(resolved.startsAt),
        newRoom: newRoomName,
        familyMemberIds: ctx.familyMemberIds,
      });
      if (result.warnings?.length) {
        warnings.push(...result.warnings);
      }
    }

    const allPlannedMoved =
      input.conflictPolicy !== "all" || movedIds.length === toMove.length;
    if (allPlannedMoved && notifySnapshots.length > 0) {
      const emailWarnings = await sendAbsenceNotifications(client, {
        kind: "moved",
        fromDate: input.fromDate,
        toDate: input.toDate,
        titularMemberId: input.titularMemberId,
        notifySegreteria: input.notifySegreteria,
        notifyFamily: input.notifyFamily,
        lessons: notifySnapshots,
      });
      warnings.push(...emailWarnings);
    }

    const success = movedIds.length > 0;
    return {
      success,
      cancelledIds: [],
      movedIds,
      leftIds: [...new Set(leftIds)],
      conflicts,
      warnings,
      errorMessage: success ? undefined : "Nessuna lezione spostata.",
    };
  } catch (err) {
    return {
      ...empty,
      errorMessage:
        err instanceof Error ? err.message : "Impossibile spostare le lezioni.",
    };
  }
}
