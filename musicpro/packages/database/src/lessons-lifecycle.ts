import type { SupabaseClient } from "@supabase/supabase-js";

import { todayInRome } from "./bookings";
import {
  cancelHoldBooking,
  createLessonBooking,
  getCourse,
  resolveLessonCalendarTitle,
  type Course,
  type CourseMutationResult,
  type CourseStatus,
  type LessonPlacement,
} from "./courses";
import {
  notifyCourseLifecycle,
  type LifecycleAccountingLine,
} from "./lessons-lifecycle-notify";
import {
  listSchoolClosures,
  type SchoolClosure,
  type SchoolCourseTerm,
} from "./lessons-settings";
import {
  getEnrollmentWallet,
  listEnrollmentWalletsForCourse,
  listLessonFees,
} from "./lessons-wallet";
import type { Database, Json } from "./types/database";

type LifecycleClient = SupabaseClient<Database>;

export type CourseLifecycleActor = {
  memberId: string;
  isStaff: boolean;
  canCloseCourses: boolean;
};

export type CourseLifecycleKind =
  | "pause"
  | "resume"
  | "close"
  | "remove_enrollment"
  | "close_request"
  | "undo";

export type LifecycleAccountingRow = LifecycleAccountingLine & {
  enrollmentId: string;
  memberId: string;
};

export type CourseLifecycleEvent = {
  id: string;
  courseId: string;
  enrollmentId: string | null;
  kind: CourseLifecycleKind;
  payload: LifecyclePayload;
  createdBy: string | null;
  createdAt: string;
  undoUntil: string | null;
  undoneAt: string | null;
  resolvedAt: string | null;
};

export type CourseCloseRequest = {
  id: string;
  courseId: string;
  courseName: string;
  createdAt: string;
  createdBy: string | null;
  actorLabel: string;
  note: string | null;
};

export type LifecyclePayload = {
  previousStatus?: CourseStatus;
  closedOn?: string | null;
  enrollmentId?: string;
  memberId?: string;
  studentLabel?: string;
  note?: string;
  lessons?: CancelledLessonSnapshot[];
  accounting?: LifecycleAccountingRow[];
};

type CancelledLessonSnapshot = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  bookingId: string | null;
  placement: LessonPlacement;
};

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];
type EventRow = Database["public"]["Tables"]["course_lifecycle_events"]["Row"];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROME = "Europe/Rome";
const UNDO_MS = 24 * 60 * 60 * 1000;

const LESSON_COLUMNS =
  "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at";

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

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ROME }).format(
    new Date(iso),
  );
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

function asPayload(value: Json): LifecyclePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LifecyclePayload;
}

function mapEvent(row: EventRow): CourseLifecycleEvent {
  return {
    id: row.id,
    courseId: row.course_id,
    enrollmentId: row.enrollment_id,
    kind: row.kind,
    payload: asPayload(row.payload),
    createdBy: row.created_by,
    createdAt: row.created_at,
    undoUntil: row.undo_until,
    undoneAt: row.undone_at,
    resolvedAt: row.resolved_at,
  };
}

function canMutateLifecycle(
  actor: CourseLifecycleActor,
  course: Course,
): boolean {
  if (actor.isStaff) return true;
  return (
    actor.canCloseCourses && course.titularMemberId === actor.memberId
  );
}

function canRequestClose(
  actor: CourseLifecycleActor,
  course: Course,
): boolean {
  return course.titularMemberId === actor.memberId && !actor.isStaff;
}

async function memberLabel(
  client: LifecycleClient,
  memberId: string,
): Promise<string> {
  const { data } = await client
    .from("members")
    .select("first_name, last_name")
    .eq("id", memberId)
    .maybeSingle();
  if (!data) return "Operatore";
  return `${data.last_name} ${data.first_name}`.trim() || "Operatore";
}

async function loadTerm(
  client: LifecycleClient,
  termId: string,
): Promise<SchoolCourseTerm | null> {
  const { data, error } = await client
    .from("school_course_terms")
    .select("id, label, starts_on, ends_on, is_current, created_at, updated_at")
    .eq("id", termId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    label: data.label,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    isCurrent: data.is_current,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function lessonIdsWithAttendance(
  client: LifecycleClient,
  lessonIds: string[],
): Promise<Set<string> | { errorMessage: string }> {
  const attended = new Set<string>();
  if (lessonIds.length === 0) return attended;
  const { data, error } = await client
    .from("lesson_attendances")
    .select("lesson_id")
    .in("lesson_id", lessonIds);
  if (error) {
    return {
      errorMessage:
        error.message || "Impossibile verificare le presenze delle lezioni.",
    };
  }
  for (const row of data ?? []) attended.add(row.lesson_id);
  return attended;
}

async function cancelEligibleLessons(
  client: LifecycleClient,
  lessons: LessonRow[],
): Promise<CancelledLessonSnapshot[] | { errorMessage: string }> {
  const snapshots: CancelledLessonSnapshot[] = [];
  const nowIso = new Date().toISOString();

  for (const lesson of lessons) {
    if (lesson.booking_id) {
      const cancelError = await cancelHoldBooking(client, lesson.booking_id);
      if (cancelError) return { errorMessage: cancelError };
    }
    const { error } = await client
      .from("lessons")
      .update({
        cancelled_at: nowIso,
        booking_id: null,
      })
      .eq("id", lesson.id);
    if (error) {
      return {
        errorMessage: error.message || "Impossibile cancellare una lezione.",
      };
    }
    snapshots.push({
      id: lesson.id,
      startsAt: lesson.starts_at,
      endsAt: lesson.ends_at,
      roomId: lesson.room_id,
      bookingId: lesson.booking_id,
      placement: lesson.placement,
    });
  }
  return snapshots;
}

async function restoreCancelledLessons(
  client: LifecycleClient,
  course: Course,
  snapshots: CancelledLessonSnapshot[],
  mode: "strict" | "soft",
): Promise<string | null> {
  const title = await resolveLessonCalendarTitle(client, course.id);
  const createdBookingIds: string[] = [];

  const rollback = async () => {
    for (const bookingId of createdBookingIds) {
      await cancelHoldBooking(client, bookingId);
    }
  };

  for (const snap of snapshots) {
    if (snap.startsAt && dateInRome(snap.startsAt) < todayInRome()) {
      continue;
    }

    let bookingId: string | null = null;
    const roomId = snap.roomId;
    if (roomId && snap.startsAt && snap.endsAt) {
      const booked = await createLessonBooking(client, {
        roomId,
        memberId: course.titularMemberId,
        startAt: snap.startsAt,
        endAt: snap.endsAt,
        title,
      });
      if (booked.bookingId) {
        bookingId = booked.bookingId;
        createdBookingIds.push(booked.bookingId);
      } else if (mode === "strict") {
        await rollback();
        return (
          booked.errorMessage ||
          "Sala occupata: annulla non possibile entro 24h."
        );
      }
    }

    const placeFree = Boolean(bookingId) || !roomId;
    const { error } = await client
      .from("lessons")
      .update(
        placeFree
          ? {
              cancelled_at: null,
              booking_id: bookingId,
              placement: snap.placement === "scheduled" ? "scheduled" : snap.placement,
              starts_at: snap.startsAt,
              ends_at: snap.endsAt,
              room_id: roomId,
            }
          : {
              cancelled_at: null,
              booking_id: null,
              placement: "da_piazzare",
              starts_at: null,
              ends_at: null,
              room_id: roomId,
            },
      )
      .eq("id", snap.id);
    if (error) {
      await rollback();
      return error.message || "Impossibile ripristinare una lezione.";
    }
  }
  return null;
}

async function fillMissingFutureLessons(
  client: LifecycleClient,
  course: Course,
  extraTakenDates: string[] = [],
): Promise<string[]> {
  const warnings: string[] = [];
  const term = await loadTerm(client, course.termId);
  if (!term) {
    warnings.push("Anno corsi non trovato: nessuna lezione extra generata.");
    return warnings;
  }
  const closures = await listSchoolClosures(client);
  const { data: existing, error } = await client
    .from("lessons")
    .select("id, sequence_number, starts_at, cancelled_at")
    .eq("course_id", course.id);
  if (error) {
    warnings.push(error.message || "Impossibile leggere le lezioni esistenti.");
    return warnings;
  }

  const takenDates = new Set<string>(extraTakenDates);
  let maxSeq = 0;
  for (const row of existing ?? []) {
    maxSeq = Math.max(maxSeq, row.sequence_number);
    if (!row.starts_at) continue;
    takenDates.add(dateInRome(row.starts_at));
  }

  const title = await resolveLessonCalendarTitle(client, course.id);
  const from = maxDate(maxDate(course.startsOn, term.startsOn), todayInRome());
  const rows: Database["public"]["Tables"]["lessons"]["Insert"][] = [];

  for (const date of weeklyDates(from, course.weeklyDow, term.endsOn)) {
    if (date < course.startsOn) continue;
    if (isSchoolClosed(date, closures)) continue;
    if (takenDates.has(date)) continue;

    maxSeq += 1;
    const startAt = romeDateTimeToUtcIso(date, course.weeklyStartMinute);
    const endAt = addMinutesIso(startAt, course.durationMinutes);

    if (!course.roomId) {
      rows.push({
        course_id: course.id,
        sequence_number: maxSeq,
        starts_at: startAt,
        ends_at: endAt,
        room_id: null,
        booking_id: null,
        placement: "scheduled",
      });
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
        course_id: course.id,
        sequence_number: maxSeq,
        starts_at: startAt,
        ends_at: endAt,
        room_id: course.roomId,
        booking_id: booked.bookingId,
        placement: "scheduled",
      });
    } else {
      if (booked.errorCode !== "SLOT_TAKEN" && booked.errorMessage) {
        warnings.push(`Lezione del ${date}: ${booked.errorMessage}`);
      }
      rows.push({
        course_id: course.id,
        sequence_number: maxSeq,
        starts_at: null,
        ends_at: null,
        room_id: course.roomId,
        booking_id: null,
        placement: "da_piazzare",
      });
    }
  }

  if (rows.length === 0) return warnings;
  const { error: insertError } = await client.from("lessons").insert(rows);
  if (insertError) {
    for (const row of rows) {
      if (row.booking_id) {
        await cancelHoldBooking(client, row.booking_id);
      }
    }
    warnings.push(
      insertError.message || "Impossibile creare le lezioni mancanti.",
    );
  }
  return warnings;
}

async function insertEvent(
  client: LifecycleClient,
  input: {
    courseId: string;
    enrollmentId?: string | null;
    kind: CourseLifecycleKind;
    payload: LifecyclePayload;
    createdBy: string;
    undoable?: boolean;
  },
): Promise<string | { errorMessage: string }> {
  const undoUntil = input.undoable
    ? new Date(Date.now() + UNDO_MS).toISOString()
    : null;
  const { data, error } = await client
    .from("course_lifecycle_events")
    .insert({
      course_id: input.courseId,
      enrollment_id: input.enrollmentId ?? null,
      kind: input.kind,
      payload: input.payload as Json,
      created_by: input.createdBy,
      undo_until: undoUntil,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      errorMessage: error?.message || "Impossibile registrare l’azione.",
    };
  }
  return data.id;
}

async function resolveOpenCloseRequests(
  client: LifecycleClient,
  courseId: string,
): Promise<void> {
  await client
    .from("course_lifecycle_events")
    .update({ resolved_at: new Date().toISOString() })
    .eq("course_id", courseId)
    .eq("kind", "close_request")
    .is("resolved_at", null);
}

function fireNotify(
  client: LifecycleClient,
  input: Parameters<typeof notifyCourseLifecycle>[1],
): void {
  void notifyCourseLifecycle(client, input).catch(() => undefined);
}

export async function getCourseAccountingSummary(
  client: LifecycleClient,
  courseId: string,
  opts?: { enrollmentId?: string },
): Promise<LifecycleAccountingRow[]> {
  const wallets = opts?.enrollmentId
    ? [await getEnrollmentWallet(client, opts.enrollmentId)].filter(
        (row): row is NonNullable<typeof row> => Boolean(row),
      )
    : await listEnrollmentWalletsForCourse(client, courseId);

  if (wallets.length === 0) return [];

  const fees = await listLessonFees(client, {
    courseId,
    mode: "all",
    status: ["aperta", "parziale"],
  });

  const memberIds = [...new Set(wallets.map((row) => row.memberId))];
  const { data: members } = await client
    .from("members")
    .select("id, first_name, last_name")
    .in("id", memberIds);
  const labels = new Map(
    (members ?? []).map((row) => [
      row.id,
      `${row.last_name} ${row.first_name}`.trim(),
    ]),
  );

  return wallets.map((wallet) => {
    const open = fees.filter(
      (fee) => fee.courseEnrollmentId === wallet.enrollmentId,
    );
    return {
      enrollmentId: wallet.enrollmentId,
      memberId: wallet.memberId,
      studentLabel: labels.get(wallet.memberId) || "Allievo",
      creditBalance: wallet.balance,
      leftoverEurFamily: wallet.leftoverEurFamily,
      openFeesEur: open.reduce((sum, fee) => sum + fee.remainingEur, 0),
      openFeeCount: open.length,
    };
  });
}

export async function listUndoableLifecycleEvents(
  client: LifecycleClient,
  courseId: string,
): Promise<CourseLifecycleEvent[]> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("course_lifecycle_events")
    .select(
      "id, course_id, enrollment_id, kind, payload, created_by, created_at, undo_until, undone_at, resolved_at",
    )
    .eq("course_id", courseId)
    .is("undone_at", null)
    .in("kind", ["pause", "close", "remove_enrollment"])
    .gt("undo_until", now)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message || "Impossibile caricare gli undo.");
  }

  const course = await getCourse(client, courseId);
  if (!course) return [];

  return (data ?? [])
    .map(mapEvent)
    .filter((event) => {
      if (event.kind === "pause") return course.status === "in_pausa";
      if (event.kind === "close") return course.status === "chiuso";
      if (event.kind === "remove_enrollment") {
        const enrollment = course.enrollments.find(
          (row) => row.id === event.enrollmentId,
        );
        return Boolean(enrollment?.leftAt);
      }
      return false;
    });
}

export async function listPendingCourseCloseRequests(
  client: LifecycleClient,
): Promise<CourseCloseRequest[]> {
  const { data, error } = await client
    .from("course_lifecycle_events")
    .select(
      "id, course_id, enrollment_id, kind, payload, created_by, created_at, undo_until, undone_at, resolved_at",
    )
    .eq("kind", "close_request")
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(
      error.message || "Impossibile caricare le richieste di chiusura.",
    );
  }
  const rows = (data ?? []).map(mapEvent);
  const out: CourseCloseRequest[] = [];
  for (const event of rows) {
    const course = await getCourse(client, event.courseId);
    const actorLabel = event.createdBy
      ? await memberLabel(client, event.createdBy)
      : "Docente";
    out.push({
      id: event.id,
      courseId: event.courseId,
      courseName: course?.name ?? "Corso",
      createdAt: event.createdAt,
      createdBy: event.createdBy,
      actorLabel,
      note: event.payload.note ?? null,
    });
  }
  return out;
}

export async function dismissCourseCloseRequest(
  client: LifecycleClient,
  input: { eventId: string; actor: CourseLifecycleActor },
): Promise<CourseMutationResult> {
  if (!input.actor.isStaff) {
    return fail("Solo la segreteria può scartare una richiesta di chiusura.");
  }
  const { data, error } = await client
    .from("course_lifecycle_events")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", input.eventId)
    .eq("kind", "close_request")
    .is("resolved_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    return fail(error.message || "Impossibile scartare la richiesta.");
  }
  if (!data) return fail("Richiesta già gestita.");
  return ok(data.id);
}

export async function pauseCourse(
  client: LifecycleClient,
  input: { courseId: string; actor: CourseLifecycleActor },
): Promise<CourseMutationResult> {
  const course = await getCourse(client, input.courseId);
  if (!course) return fail("Corso non trovato.");
  if (course.isTrial) return fail("La prova si gestisce dalle azioni prova.");
  if (!canMutateLifecycle(input.actor, course)) {
    return fail("Non puoi mettere in pausa questo corso.");
  }
  if (course.status !== "attivo") {
    return fail("Si può mettere in pausa solo un corso attivo.");
  }

  const { data: lessons, error: lessonError } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("course_id", course.id)
    .is("cancelled_at", null)
    .eq("placement", "scheduled");
  if (lessonError) {
    return fail(lessonError.message || "Impossibile caricare le lezioni.");
  }

  const now = Date.now();
  const candidates = (lessons ?? []).filter((row) => {
    if (!row.starts_at) return false;
    return new Date(row.starts_at).getTime() > now;
  });
  const attended = await lessonIdsWithAttendance(
    client,
    candidates.map((row) => row.id),
  );
  if ("errorMessage" in attended) return fail(attended.errorMessage);
  const toCancel = candidates.filter((row) => !attended.has(row.id));
  const cancelled = await cancelEligibleLessons(client, toCancel);
  if ("errorMessage" in cancelled) return fail(cancelled.errorMessage);

  const { error } = await client
    .from("courses")
    .update({ status: "in_pausa" })
    .eq("id", course.id);
  if (error) {
    const restoreError = await restoreCancelledLessons(
      client,
      course,
      cancelled,
      "strict",
    );
    return fail(
      restoreError
        ? `${error.message || "Impossibile mettere in pausa il corso."} ${restoreError}`
        : error.message || "Impossibile mettere in pausa il corso.",
    );
  }

  const eventId = await insertEvent(client, {
    courseId: course.id,
    kind: "pause",
    createdBy: input.actor.memberId,
    undoable: true,
    payload: {
      previousStatus: course.status,
      lessons: cancelled,
    },
  });
  if (typeof eventId !== "string") {
    await restoreCancelledLessons(client, course, cancelled, "soft");
    await client
      .from("courses")
      .update({ status: course.status })
      .eq("id", course.id);
    return fail(eventId.errorMessage);
  }

  const actorLabel = await memberLabel(client, input.actor.memberId);
  fireNotify(client, {
    kind: "pause",
    courseId: course.id,
    courseName: course.name,
    actorLabel,
    studentLabels: course.enrollments
      .filter((row) => !row.leftAt)
      .map((row) => `${row.lastName} ${row.firstName}`.trim()),
  });
  return ok(eventId);
}

export async function resumeCourse(
  client: LifecycleClient,
  input: { courseId: string; actor: CourseLifecycleActor },
): Promise<CourseMutationResult> {
  const course = await getCourse(client, input.courseId);
  if (!course) return fail("Corso non trovato.");
  if (course.isTrial) return fail("La prova si gestisce dalle azioni prova.");
  if (!canMutateLifecycle(input.actor, course)) {
    return fail("Non puoi riprendere questo corso.");
  }
  if (course.status !== "in_pausa") {
    return fail("Si può riprendere solo un corso in pausa.");
  }

  const { data: pauseRow } = await client
    .from("course_lifecycle_events")
    .select(
      "id, course_id, enrollment_id, kind, payload, created_by, created_at, undo_until, undone_at, resolved_at",
    )
    .eq("course_id", course.id)
    .eq("kind", "pause")
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await client
    .from("courses")
    .update({ status: "attivo" })
    .eq("id", course.id);
  if (error) {
    return fail(error.message || "Impossibile riprendere il corso.");
  }

  const warnings: string[] = [];
  const snapshots = pauseRow ? asPayload(pauseRow.payload).lessons ?? [] : [];
  if (snapshots.length > 0) {
    const restoreError = await restoreCancelledLessons(
      client,
      course,
      snapshots,
      "soft",
    );
    if (restoreError) {
      await client
        .from("courses")
        .update({ status: "in_pausa" })
        .eq("id", course.id);
      return fail(restoreError);
    }
  }
  const restoredDates = snapshots
    .map((snap) => (snap.startsAt ? dateInRome(snap.startsAt) : null))
    .filter((date): date is string => Boolean(date));
  warnings.push(
    ...(await fillMissingFutureLessons(
      client,
      { ...course, status: "attivo" },
      restoredDates,
    )),
  );

  const eventId = await insertEvent(client, {
    courseId: course.id,
    kind: "resume",
    createdBy: input.actor.memberId,
    payload: { previousStatus: "in_pausa" },
  });
  if (typeof eventId !== "string") {
    await client
      .from("courses")
      .update({ status: "in_pausa" })
      .eq("id", course.id);
    return fail(eventId.errorMessage);
  }

  const actorLabel = await memberLabel(client, input.actor.memberId);
  fireNotify(client, {
    kind: "resume",
    courseId: course.id,
    courseName: course.name,
    actorLabel,
  });
  return ok(eventId, warnings.length > 0 ? warnings : undefined);
}

export async function closeCourse(
  client: LifecycleClient,
  input: { courseId: string; closedOn: string; actor: CourseLifecycleActor },
): Promise<CourseMutationResult> {
  const closedOn = input.closedOn.trim();
  if (!ISO_DATE_RE.test(closedOn)) {
    return fail("La data di chiusura è obbligatoria (AAAA-MM-GG).");
  }

  const course = await getCourse(client, input.courseId);
  if (!course) return fail("Corso non trovato.");
  if (course.isTrial) return fail("La prova si gestisce dalle azioni prova.");
  if (!canMutateLifecycle(input.actor, course)) {
    return fail("Non puoi chiudere questo corso.");
  }
  if (course.courseKind === "gruppo") {
    return fail("Nei corsi di gruppo usa Rimuovi iscritto, non Chiudi corso.");
  }
  if (course.status !== "attivo" && course.status !== "in_pausa") {
    return fail("Si può chiudere solo un corso attivo o in pausa.");
  }

  const { data: lessons, error: lessonError } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("course_id", course.id)
    .is("cancelled_at", null);
  if (lessonError) {
    return fail(lessonError.message || "Impossibile caricare le lezioni.");
  }

  const candidates = (lessons ?? []).filter((row) => {
    if (!row.starts_at) return true;
    return dateInRome(row.starts_at) > closedOn;
  });
  const attended = await lessonIdsWithAttendance(
    client,
    candidates.map((row) => row.id),
  );
  if ("errorMessage" in attended) return fail(attended.errorMessage);
  const toCancel = candidates.filter((row) => !attended.has(row.id));
  const cancelled = await cancelEligibleLessons(client, toCancel);
  if ("errorMessage" in cancelled) return fail(cancelled.errorMessage);

  const { error } = await client
    .from("courses")
    .update({ status: "chiuso", closed_on: closedOn })
    .eq("id", course.id);
  if (error) {
    const restoreError = await restoreCancelledLessons(
      client,
      course,
      cancelled,
      "strict",
    );
    return fail(
      restoreError
        ? `${error.message || "Impossibile chiudere il corso."} ${restoreError}`
        : error.message || "Impossibile chiudere il corso.",
    );
  }

  const accounting = await getCourseAccountingSummary(client, course.id);
  const eventId = await insertEvent(client, {
    courseId: course.id,
    kind: "close",
    createdBy: input.actor.memberId,
    undoable: true,
    payload: {
      previousStatus: course.status,
      closedOn,
      lessons: cancelled,
      accounting,
    },
  });
  if (typeof eventId !== "string") {
    await restoreCancelledLessons(client, course, cancelled, "soft");
    await client
      .from("courses")
      .update({ status: course.status, closed_on: course.closedOn })
      .eq("id", course.id);
    return fail(eventId.errorMessage);
  }

  await resolveOpenCloseRequests(client, course.id);

  const actorLabel = await memberLabel(client, input.actor.memberId);
  const active = course.enrollments.filter((row) => !row.leftAt);
  fireNotify(client, {
    kind: "close",
    courseId: course.id,
    courseName: course.name,
    actorLabel,
    closedOn,
    studentLabels: active.map((row) =>
      `${row.lastName} ${row.firstName}`.trim(),
    ),
    accounting,
    familyMemberIds: active.map((row) => row.memberId),
  });
  return ok(eventId);
}

export async function removeCourseEnrollment(
  client: LifecycleClient,
  input: { enrollmentId: string; actor: CourseLifecycleActor },
): Promise<CourseMutationResult> {
  const { data: enrollment, error: enrollError } = await client
    .from("course_enrollments")
    .select("id, course_id, member_id, left_at")
    .eq("id", input.enrollmentId)
    .maybeSingle();
  if (enrollError) {
    return fail(enrollError.message || "Impossibile caricare l’iscrizione.");
  }
  if (!enrollment) return fail("Iscrizione non trovata.");
  if (enrollment.left_at) return fail("L’allievo è già uscito dal corso.");

  const course = await getCourse(client, enrollment.course_id);
  if (!course) return fail("Corso non trovato.");
  if (course.isTrial) return fail("La prova si gestisce dalle azioni prova.");
  if (!canMutateLifecycle(input.actor, course)) {
    return fail("Non puoi rimuovere un iscritto da questo corso.");
  }
  if (course.courseKind !== "gruppo") {
    return fail("Rimuovi iscritto è solo per i corsi di gruppo. Usa Chiudi corso.");
  }
  if (course.status !== "attivo" && course.status !== "in_pausa") {
    return fail("Si può rimuovere un iscritto solo da un corso aperto.");
  }

  const leftAt = new Date().toISOString();
  const { error } = await client
    .from("course_enrollments")
    .update({ left_at: leftAt })
    .eq("id", enrollment.id);
  if (error) {
    return fail(error.message || "Impossibile rimuovere l’iscritto.");
  }

  const accounting = await getCourseAccountingSummary(client, course.id, {
    enrollmentId: enrollment.id,
  });
  const student =
    course.enrollments.find((row) => row.id === enrollment.id) ?? null;
  const studentLabel = student
    ? `${student.lastName} ${student.firstName}`.trim()
    : "Allievo";

  const eventId = await insertEvent(client, {
    courseId: course.id,
    enrollmentId: enrollment.id,
    kind: "remove_enrollment",
    createdBy: input.actor.memberId,
    undoable: true,
    payload: {
      previousStatus: course.status,
      enrollmentId: enrollment.id,
      memberId: enrollment.member_id,
      studentLabel,
      accounting,
    },
  });
  if (typeof eventId !== "string") return fail(eventId.errorMessage);

  const actorLabel = await memberLabel(client, input.actor.memberId);
  fireNotify(client, {
    kind: "remove_enrollment",
    courseId: course.id,
    courseName: course.name,
    actorLabel,
    studentLabels: [studentLabel],
    accounting,
    familyMemberIds: [enrollment.member_id],
  });
  return ok(eventId);
}

export async function requestCourseClose(
  client: LifecycleClient,
  input: { courseId: string; actor: CourseLifecycleActor; note?: string },
): Promise<CourseMutationResult> {
  const course = await getCourse(client, input.courseId);
  if (!course) return fail("Corso non trovato.");
  if (course.isTrial) return fail("La prova si gestisce dalle azioni prova.");
  if (!canRequestClose(input.actor, course) && !input.actor.isStaff) {
    return fail("Solo il titolare può chiedere la chiusura.");
  }
  if (canMutateLifecycle(input.actor, course)) {
    return fail("Puoi chiudere il corso direttamente, senza richiesta.");
  }
  if (course.status !== "attivo" && course.status !== "in_pausa") {
    return fail("Si può chiedere la chiusura solo di un corso aperto.");
  }

  const { data: existing } = await client
    .from("course_lifecycle_events")
    .select("id")
    .eq("course_id", course.id)
    .eq("kind", "close_request")
    .is("resolved_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return fail("Richiesta di chiusura già in coda.");

  const eventId = await insertEvent(client, {
    courseId: course.id,
    kind: "close_request",
    createdBy: input.actor.memberId,
    payload: { note: input.note?.trim() || undefined },
  });
  if (typeof eventId !== "string") return fail(eventId.errorMessage);

  const actorLabel = await memberLabel(client, input.actor.memberId);
  fireNotify(client, {
    kind: "close_request",
    courseId: course.id,
    courseName: course.name,
    actorLabel,
    note: input.note ?? null,
  });
  return ok(eventId);
}

export async function undoCourseLifecycle(
  client: LifecycleClient,
  input: { eventId: string; actor: CourseLifecycleActor },
): Promise<CourseMutationResult> {
  const { data: row, error } = await client
    .from("course_lifecycle_events")
    .select(
      "id, course_id, enrollment_id, kind, payload, created_by, created_at, undo_until, undone_at, resolved_at",
    )
    .eq("id", input.eventId)
    .maybeSingle();
  if (error) {
    return fail(error.message || "Impossibile caricare l’azione.");
  }
  if (!row) return fail("Azione non trovata.");

  const event = mapEvent(row);
  const course = await getCourse(client, event.courseId);
  if (!course) return fail("Corso non trovato.");

  const allowed =
    input.actor.isStaff ||
    event.createdBy === input.actor.memberId ||
    canMutateLifecycle(input.actor, course);
  if (!allowed) return fail("Non puoi annullare questa azione.");
  if (event.undoneAt) return fail("Azione già annullata.");
  if (
    event.kind !== "pause" &&
    event.kind !== "close" &&
    event.kind !== "remove_enrollment"
  ) {
    return fail("Questa azione non si può annullare.");
  }
  if (!event.undoUntil || new Date(event.undoUntil).getTime() <= Date.now()) {
    return fail("La finestra di 24 ore per annullare è scaduta.");
  }

  if (event.kind === "pause" && course.status !== "in_pausa") {
    return fail("Il corso non è più in pausa.");
  }
  if (event.kind === "close" && course.status !== "chiuso") {
    return fail("Il corso non è più chiuso.");
  }
  if (event.kind === "remove_enrollment") {
    const enrollment = course.enrollments.find(
      (row) => row.id === event.enrollmentId,
    );
    if (!enrollment?.leftAt) {
      return fail("L’iscritto non risulta uscito.");
    }
  }

  const snapshots = event.payload.lessons ?? [];
  if (snapshots.length > 0 && event.kind !== "remove_enrollment") {
    const restoreError = await restoreCancelledLessons(
      client,
      course,
      snapshots,
      "strict",
    );
    if (restoreError) return fail(restoreError);
  }

  if (event.kind === "pause") {
    const { error: courseError } = await client
      .from("courses")
      .update({ status: event.payload.previousStatus ?? "attivo" })
      .eq("id", course.id);
    if (courseError) {
      return fail(courseError.message || "Impossibile ripristinare il corso.");
    }
  }

  if (event.kind === "close") {
    const { error: courseError } = await client
      .from("courses")
      .update({
        status: event.payload.previousStatus ?? "attivo",
        closed_on: null,
      })
      .eq("id", course.id);
    if (courseError) {
      return fail(courseError.message || "Impossibile riaprire il corso.");
    }
  }

  if (event.kind === "remove_enrollment" && event.enrollmentId) {
    const { error: enrollError } = await client
      .from("course_enrollments")
      .update({ left_at: null })
      .eq("id", event.enrollmentId);
    if (enrollError) {
      return fail(enrollError.message || "Impossibile reintegrare l’iscritto.");
    }
  }

  const { error: undoError } = await client
    .from("course_lifecycle_events")
    .update({ undone_at: new Date().toISOString() })
    .eq("id", event.id);
  if (undoError) {
    return fail(undoError.message || "Impossibile registrare l’annullo.");
  }

  const actorLabel = await memberLabel(client, input.actor.memberId);
  fireNotify(client, {
    kind: "undo",
    courseId: course.id,
    courseName: course.name,
    actorLabel,
  });
  return ok(event.id);
}
