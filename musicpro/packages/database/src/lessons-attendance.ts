import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getRomeDayBoundsUtc,
  todayInRome,
} from "./bookings";
import {
  cancelHoldBooking,
  getCourse,
  type CourseMutationResult,
  type Lesson,
  type LessonParkedReason,
} from "./courses";
import { notifyLessonScheduleChange } from "./lessons-notify";
import { isPayrollMonthClosed } from "./lessons-payroll";
import { getLessonSchoolSettings } from "./lessons-settings";
import type { Database } from "./types/database";

type AttendanceClient = SupabaseClient<Database>;

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

export type AttendanceStatus = "presente" | "assente" | "assente_giustificato";

export type LessonRosterStudent = {
  memberId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  tutorPhone: string | null;
  status: AttendanceStatus | null;
};

export type LessonRoster = {
  lessonId: string;
  courseId: string;
  courseName: string;
  courseKind: "individuale" | "gruppo" | "online";
  startsAt: string | null;
  students: LessonRosterStudent[];
  canEdit: boolean;
  editBlockReason: string | null;
  payrollClosed?: boolean;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LESSON_COLUMNS =
  "id, course_id, sequence_number, starts_at, ends_at, room_id, booking_id, placement, cancelled_at, kind, recovered_from_lesson_id, makeup_member_id, parked_reason, original_starts_at, created_at, updated_at";

const ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  "presente",
  "assente",
  "assente_giustificato",
]);

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

function isAttendanceStatus(value: string): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.has(value as AttendanceStatus);
}

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function daysBetweenRomeDates(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - start) / 86_400_000);
}

async function loadLesson(
  client: AttendanceClient,
  lessonId: string,
): Promise<{ lesson: Lesson | null; errorMessage?: string }> {
  const { data, error } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("id", lessonId)
    .maybeSingle();

  if (error) {
    return {
      lesson: null,
      errorMessage: error.message || "Impossibile caricare la lezione.",
    };
  }
  return { lesson: data ? mapLesson(data) : null };
}

async function attendanceEditWindowDays(
  client: AttendanceClient,
): Promise<number> {
  const settings = await getLessonSchoolSettings(client);
  const days = settings?.attendanceEditDays;
  return typeof days === "number" && Number.isFinite(days) && days >= 0
    ? days
    : 14;
}

function editBlockForLesson(params: {
  lessonId: string;
  courseStatus: string;
  cancelledAt: string | null;
  placement: string;
  startsAt: string | null;
  isStaff: boolean;
  isTitular: boolean;
  attendanceEditDays: number;
}): { canEdit: boolean; editBlockReason: string | null } {
  if (params.lessonId.startsWith("hold:")) {
    return {
      canEdit: false,
      editBlockReason: "Non si possono segnare presenze su un hold.",
    };
  }
  if (params.courseStatus === "in_attesa") {
    return {
      canEdit: false,
      editBlockReason: "Non si possono segnare presenze su un corso in attesa.",
    };
  }
  if (params.cancelledAt) {
    return {
      canEdit: false,
      editBlockReason: "La lezione è stata annullata.",
    };
  }
  if (params.placement !== "scheduled") {
    return {
      canEdit: false,
      editBlockReason: "Si possono segnare presenze solo sulle lezioni in calendario.",
    };
  }
  if (!params.isStaff && !params.isTitular) {
    return {
      canEdit: false,
      editBlockReason: "Solo il titolare o lo staff possono modificare le presenze.",
    };
  }
  if (params.startsAt) {
    const lessonDate = dateInRome(params.startsAt);
    const elapsed = daysBetweenRomeDates(lessonDate, todayInRome());
    if (elapsed > params.attendanceEditDays) {
      return {
        canEdit: false,
        editBlockReason: "La finestra di modifica presenze è scaduta.",
      };
    }
  }
  return { canEdit: true, editBlockReason: null };
}

async function loadRosterStudents(
  client: AttendanceClient,
  params: {
    courseId: string;
    makeupMemberId: string | null;
    kind: Lesson["kind"];
    attendanceByMember: Map<string, AttendanceStatus>;
  },
): Promise<LessonRosterStudent[]> {
  const memberIds = new Set<string>();
  if (params.kind === "recupero" && params.makeupMemberId) {
    memberIds.add(params.makeupMemberId);
  } else {
    const { data: enrollments, error } = await client
      .from("course_enrollments")
      .select("member_id")
      .eq("course_id", params.courseId)
      .is("left_at", null);
    if (error) {
      throw new Error(
        `Impossibile caricare gli iscritti: ${error.message}`,
      );
    }
    for (const row of enrollments ?? []) {
      memberIds.add(row.member_id);
    }
  }

  if (memberIds.size === 0) return [];

  const { data: members, error: membersError } = await client
    .from("members")
    .select("id, first_name, last_name, phone, manual_tutor_phone")
    .in("id", [...memberIds]);
  if (membersError) {
    throw new Error(
      `Impossibile caricare gli allievi: ${membersError.message}`,
    );
  }

  const students: LessonRosterStudent[] = (members ?? []).map((row) => ({
    memberId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    tutorPhone: row.manual_tutor_phone,
    status: params.attendanceByMember.get(row.id) ?? null,
  }));

  students.sort((a, b) => {
    const byLast = a.lastName.localeCompare(b.lastName, "it");
    return byLast !== 0 ? byLast : a.firstName.localeCompare(b.firstName, "it");
  });
  return students;
}

async function nextSequenceNumber(
  client: AttendanceClient,
  courseId: string,
): Promise<number> {
  const { data, error } = await client
    .from("lessons")
    .select("sequence_number")
    .eq("course_id", courseId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Impossibile calcolare il numero lezione: ${error.message}`,
    );
  }
  return (data?.sequence_number ?? 0) + 1;
}

async function existingMakeupLessonId(
  client: AttendanceClient,
  recoveredFromLessonId: string,
  makeupMemberId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("lessons")
    .select("id")
    .eq("recovered_from_lesson_id", recoveredFromLessonId)
    .eq("makeup_member_id", makeupMemberId)
    .eq("kind", "recupero")
    .is("cancelled_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Impossibile verificare i recuperi esistenti: ${error.message}`,
    );
  }
  return data?.id ?? null;
}

async function createGroupMakeupLesson(
  client: AttendanceClient,
  params: {
    courseId: string;
    recoveredFromLessonId: string;
    makeupMemberId: string;
    roomId: string | null;
    originalStartsAt: string | null;
    sequenceNumber: number;
  },
): Promise<void> {
  const { error } = await client.from("lessons").insert({
    course_id: params.courseId,
    sequence_number: params.sequenceNumber,
    starts_at: null,
    ends_at: null,
    room_id: params.roomId,
    booking_id: null,
    placement: "da_recuperare",
    kind: "recupero",
    recovered_from_lesson_id: params.recoveredFromLessonId,
    makeup_member_id: params.makeupMemberId,
    parked_reason: "giustificato",
    original_starts_at: params.originalStartsAt,
  });
  if (error) {
    throw new Error(
      error.message || "Impossibile creare la lezione di recupero.",
    );
  }
}

export async function getLessonRoster(
  client: AttendanceClient,
  lessonId: string,
  actor: { memberId: string; isStaff: boolean },
): Promise<LessonRoster | null> {
  const attendanceEditDays = await attendanceEditWindowDays(client);

  if (lessonId.startsWith("hold:")) {
    const courseId = lessonId.slice("hold:".length);
    const course = await getCourse(client, courseId);
    if (!course) return null;
    const students = await loadRosterStudents(client, {
      courseId: course.id,
      makeupMemberId: null,
      kind: "regular",
      attendanceByMember: new Map(),
    });
    return {
      lessonId,
      courseId: course.id,
      courseName: course.name,
      courseKind: course.courseKind,
      startsAt: null,
      students,
      canEdit: false,
      editBlockReason: "Non si possono segnare presenze su un hold.",
    };
  }

  const loaded = await loadLesson(client, lessonId);
  if (loaded.errorMessage) {
    throw new Error(loaded.errorMessage);
  }
  if (!loaded.lesson) return null;

  const lesson = loaded.lesson;
  const course = await getCourse(client, lesson.courseId);
  if (!course) return null;

  const { data: attendanceRows, error: attendanceError } = await client
    .from("lesson_attendances")
    .select("member_id, status")
    .eq("lesson_id", lesson.id);
  if (attendanceError) {
    throw new Error(
      `Impossibile caricare le presenze: ${attendanceError.message}`,
    );
  }

  const attendanceByMember = new Map<string, AttendanceStatus>();
  for (const row of attendanceRows ?? []) {
    if (isAttendanceStatus(row.status)) {
      attendanceByMember.set(row.member_id, row.status);
    }
  }

  const students = await loadRosterStudents(client, {
    courseId: course.id,
    makeupMemberId: lesson.makeupMemberId,
    kind: lesson.kind,
    attendanceByMember,
  });

  const edit = editBlockForLesson({
    lessonId: lesson.id,
    courseStatus: course.status,
    cancelledAt: lesson.cancelledAt,
    placement: lesson.placement,
    startsAt: lesson.startsAt,
    isStaff: actor.isStaff,
    isTitular: course.titularMemberId === actor.memberId,
    attendanceEditDays,
  });

  let canEdit = edit.canEdit;
  let editBlockReason = edit.editBlockReason;
  let payrollClosed = false;
  if (lesson.startsAt) {
    payrollClosed = await isPayrollMonthClosed(
      client,
      course.titularMemberId,
      dateInRome(lesson.startsAt),
    );
    if (payrollClosed && !actor.isStaff) {
      canEdit = false;
      editBlockReason =
        "Mese notula chiuso. Chiedi alla segreteria di sbloccare.";
    }
  }

  return {
    lessonId: lesson.id,
    courseId: course.id,
    courseName: course.name,
    courseKind: course.courseKind,
    startsAt: lesson.startsAt,
    students,
    canEdit,
    editBlockReason,
    payrollClosed: payrollClosed || undefined,
  };
}

export async function parkScheduledLesson(
  client: AttendanceClient,
  lessonId: string,
  reason: "giustificato" | "cancellata_scuola" | "docente_assente",
): Promise<CourseMutationResult> {
  if (lessonId.startsWith("hold:")) {
    return fail("Non si può parcheggiare un hold.");
  }

  const loaded = await loadLesson(client, lessonId);
  if (loaded.errorMessage) return fail(loaded.errorMessage);
  if (!loaded.lesson) return fail("Lezione non trovata.");

  const lesson = loaded.lesson;
  if (lesson.cancelledAt) {
    return fail("La lezione è stata annullata.");
  }
  if (lesson.placement !== "scheduled") {
    return fail("Si possono parcheggiare solo le lezioni in calendario.");
  }

  if (reason !== "giustificato") {
    const { data: attendanceRows, error: attendanceError } = await client
      .from("lesson_attendances")
      .select("lesson_id")
      .eq("lesson_id", lessonId)
      .limit(1);
    if (attendanceError) {
      return fail(
        attendanceError.message || "Impossibile verificare le presenze.",
      );
    }
    if ((attendanceRows ?? []).length > 0) {
      return fail(
        "Lezione già presenziata: sblocca la presenza prima di parcheggiarla.",
      );
    }
  }

  if (lesson.bookingId) {
    const cancelError = await cancelHoldBooking(client, lesson.bookingId);
    if (cancelError) return fail(cancelError);
  }

  const originalStartsAt = lesson.originalStartsAt ?? lesson.startsAt;
  const { error } = await client
    .from("lessons")
    .update({
      placement: "da_recuperare",
      original_starts_at: originalStartsAt,
      starts_at: null,
      ends_at: null,
      booking_id: null,
      parked_reason: reason satisfies LessonParkedReason,
    })
    .eq("id", lessonId);

  if (error) {
    return fail(error.message || "Impossibile parcheggiare la lezione.");
  }

  const kind = reason === "cancellata_scuola" ? "cancelled" : "to_recover";
  void notifyLessonScheduleChange(client, {
    lessonId,
    kind,
    notifyTeachers:
      reason === "cancellata_scuola" || reason === "docente_assente",
  }).catch(() => undefined);

  return ok(lessonId);
}

export async function saveLessonAttendance(
  client: AttendanceClient,
  input: {
    lessonId: string;
    actorMemberId: string;
    isStaff: boolean;
    rows: { memberId: string; status: AttendanceStatus }[];
  },
): Promise<CourseMutationResult> {
  if (input.lessonId.startsWith("hold:")) {
    return fail("Non si possono segnare presenze su un hold.");
  }

  for (const row of input.rows) {
    if (!isAttendanceStatus(row.status)) {
      return fail("Stato presenza non valido.");
    }
  }

  const roster = await getLessonRoster(client, input.lessonId, {
    memberId: input.actorMemberId,
    isStaff: input.isStaff,
  });
  if (!roster) return fail("Lezione non trovata.");
  if (!roster.canEdit) {
    return fail(roster.editBlockReason || "Non è possibile modificare le presenze.");
  }
  // Mese closed: lo staff può salvare; la notula NON si sblocca qui (lo fa la UI).

  const allowedMembers = new Set(roster.students.map((row) => row.memberId));
  for (const row of input.rows) {
    if (!allowedMembers.has(row.memberId)) {
      return fail("Uno o più allievi non appartengono a questa lezione.");
    }
  }

  const previousByMember = new Map(
    roster.students.map((row) => [row.memberId, row.status]),
  );

  const warnings: string[] = [];

  if (input.rows.length > 0) {
    const markedAt = new Date().toISOString();
    const { error: upsertError } = await client.from("lesson_attendances").upsert(
      input.rows.map((row) => ({
        lesson_id: input.lessonId,
        member_id: row.memberId,
        status: row.status,
        marked_by: input.actorMemberId,
        marked_at: markedAt,
      })),
      { onConflict: "lesson_id,member_id" },
    );
    if (upsertError) {
      return fail(upsertError.message || "Impossibile salvare le presenze.");
    }

    const { data: walletSync, error: walletError } = await client.rpc(
      "sync_lesson_wallet_after_attendance",
      { p_lesson_id: input.lessonId },
    );
    if (walletError) {
      warnings.push(
        walletError.message || "Impossibile aggiornare i crediti lezione.",
      );
    } else if (
      walletSync &&
      typeof walletSync === "object" &&
      !Array.isArray(walletSync) &&
      walletSync.success === false
    ) {
      const message = walletSync.message;
      warnings.push(
        typeof message === "string" && message.trim()
          ? message
          : "Impossibile aggiornare i crediti lezione.",
      );
    }
  }

  const loaded = await loadLesson(client, input.lessonId);
  if (loaded.errorMessage) return fail(loaded.errorMessage);
  if (!loaded.lesson) return fail("Lezione non trovata.");
  const lesson = loaded.lesson;

  const course = await getCourse(client, lesson.courseId);
  if (!course) return fail("Corso non trovato.");

  const giustificati = input.rows.filter((row) => {
    if (row.status !== "assente_giustificato") return false;
    return previousByMember.get(row.memberId) !== "assente_giustificato";
  });

  let nextSequence: number | null = null;

  for (const row of giustificati) {
    const shouldCreateMakeup =
      course.courseKind === "gruppo" && lesson.kind === "regular";

    if (shouldCreateMakeup) {
      try {
        const existingId = await existingMakeupLessonId(
          client,
          lesson.id,
          row.memberId,
        );
        if (existingId) continue;
        if (nextSequence == null) {
          nextSequence = await nextSequenceNumber(client, course.id);
        }
        await createGroupMakeupLesson(client, {
          courseId: course.id,
          recoveredFromLessonId: lesson.id,
          makeupMemberId: row.memberId,
          roomId: lesson.roomId,
          originalStartsAt: lesson.startsAt,
          sequenceNumber: nextSequence,
        });
        nextSequence += 1;
      } catch (err) {
        warnings.push(
          err instanceof Error
            ? err.message
            : "Impossibile creare la lezione di recupero.",
        );
      }
      continue;
    }

    const parked = await parkScheduledLesson(client, lesson.id, "giustificato");
    if (!parked.success) {
      if (parked.errorMessage) warnings.push(parked.errorMessage);
    }
    break;
  }

  if (course.courseKind === "gruppo" && roster.students.length > 0) {
    const nextByMember = new Map(previousByMember);
    for (const row of input.rows) {
      nextByMember.set(row.memberId, row.status);
    }
    const allGiustificati = roster.students.every(
      (student) => nextByMember.get(student.memberId) === "assente_giustificato",
    );
    if (allGiustificati) {
      const parked = await parkScheduledLesson(
        client,
        input.lessonId,
        "giustificato",
      );
      if (!parked.success && parked.errorMessage) {
        warnings.push(parked.errorMessage);
      }
    }
  }

  return ok(input.lessonId, warnings);
}

/** Solo staff. Cancella le righe presenza e riallinea i consumi wallet. La notula NON si sblocca qui. */
export async function unlockLessonAttendance(
  client: AttendanceClient,
  lessonId: string,
  actor: { memberId: string; isStaff: boolean },
): Promise<CourseMutationResult> {
  if (lessonId.startsWith("hold:")) {
    return fail("Non si sblocca un hold.");
  }
  if (!actor.isStaff) {
    return fail("Solo la segreteria può sbloccare le presenze.");
  }

  const loaded = await loadLesson(client, lessonId);
  if (loaded.errorMessage) return fail(loaded.errorMessage);
  if (!loaded.lesson) return fail("Lezione non trovata.");

  const { error } = await client
    .from("lesson_attendances")
    .delete()
    .eq("lesson_id", lessonId);
  if (error) {
    return fail(error.message || "Impossibile sbloccare le presenze.");
  }

  const warnings: string[] = [];
  const { data: walletSync, error: walletError } = await client.rpc(
    "sync_lesson_wallet_after_attendance",
    { p_lesson_id: lessonId },
  );
  if (walletError) {
    warnings.push(
      walletError.message || "Presenze sbloccate, ma i crediti non sono stati ripristinati.",
    );
  } else if (
    walletSync &&
    typeof walletSync === "object" &&
    !Array.isArray(walletSync) &&
    walletSync.success === false
  ) {
    const message = walletSync.message;
    warnings.push(
      typeof message === "string" && message.trim()
        ? message
        : "Presenze sbloccate, ma i crediti non sono stati ripristinati.",
    );
  }

  return ok(lessonId, warnings);
}

export async function cancelLessonAsSchool(
  client: AttendanceClient,
  lessonId: string,
  actor: { memberId: string; isStaff: boolean },
): Promise<CourseMutationResult> {
  if (lessonId.startsWith("hold:")) {
    return fail("Non si può annullare un hold come lezione.");
  }

  const loaded = await loadLesson(client, lessonId);
  if (loaded.errorMessage) return fail(loaded.errorMessage);
  if (!loaded.lesson) return fail("Lezione non trovata.");

  const course = await getCourse(client, loaded.lesson.courseId);
  if (!course) return fail("Corso non trovato.");

  const isTitular = course.titularMemberId === actor.memberId;
  if (!actor.isStaff && !isTitular) {
    return fail("Solo il titolare o lo staff possono cancellare la lezione.");
  }

  return parkScheduledLesson(client, lessonId, "cancellata_scuola");
}

export async function markTeacherAbsent(
  client: AttendanceClient,
  input: {
    titularMemberId: string;
    fromDate: string;
    toDate: string;
    actorMemberId: string;
    isStaff: boolean;
  },
): Promise<CourseMutationResult> {
  if (!input.isStaff && input.actorMemberId !== input.titularMemberId) {
    return fail("Puoi segnare assente solo te stesso.");
  }
  if (!ISO_DATE_RE.test(input.fromDate) || !ISO_DATE_RE.test(input.toDate)) {
    return fail("Le date del periodo non sono valide.");
  }
  if (input.toDate < input.fromDate) {
    return fail("La data di fine deve essere successiva o uguale all'inizio.");
  }

  const { startUtc } = getRomeDayBoundsUtc(input.fromDate);
  const { endUtc } = getRomeDayBoundsUtc(input.toDate);

  const { data: courses, error: coursesError } = await client
    .from("courses")
    .select("id")
    .eq("titular_member_id", input.titularMemberId)
    .eq("status", "attivo")
    .eq("is_trial", false);
  if (coursesError) {
    return fail(coursesError.message || "Impossibile caricare i corsi del docente.");
  }
  const courseIds = (courses ?? []).map((row) => row.id);
  if (courseIds.length === 0) {
    return ok(input.titularMemberId, [
      "Nessuna lezione in calendario in questo periodo.",
    ]);
  }

  const { data: lessonRows, error: lessonsError } = await client
    .from("lessons")
    .select("id")
    .in("course_id", courseIds)
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .gte("starts_at", startUtc)
    .lt("starts_at", endUtc);
  if (lessonsError) {
    return fail(
      lessonsError.message || "Impossibile caricare le lezioni del docente.",
    );
  }

  const lessonIds = (lessonRows ?? []).map((row) => row.id);
  let parkedCount = 0;
  const warnings: string[] = [];

  for (const lessonId of lessonIds) {
    const result = await parkScheduledLesson(client, lessonId, "docente_assente");
    if (result.success) {
      parkedCount += 1;
    } else if (result.errorMessage) {
      warnings.push(result.errorMessage);
    }
  }

  warnings.unshift(
    parkedCount === 1
      ? "1 lezione messa in da recuperare."
      : `${parkedCount} lezioni messe in da recuperare.`,
  );
  return ok(input.titularMemberId, warnings);
}

export async function listRecoverableLessons(
  client: AttendanceClient,
): Promise<Lesson[]> {
  const { data, error } = await client
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("placement", "da_recuperare")
    .is("cancelled_at", null)
    .order("original_starts_at", { ascending: true, nullsFirst: false })
    .order("course_id", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare le lezioni da recuperare: ${error.message}`,
    );
  }
  return (data ?? []).map(mapLesson);
}
