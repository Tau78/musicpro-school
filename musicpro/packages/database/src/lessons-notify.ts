import type { SupabaseClient } from "@supabase/supabase-js";

import { getLessonSchoolSettings } from "./lessons-settings";
import { sendLessonFamilyEmail, sendSingleEmail } from "./messaging";
import type { Database } from "./types/database";

type NotifyClient = SupabaseClient<Database>;

const ROME = "Europe/Rome";
const DEFAULT_DAY_HOURS = 24;
const DEFAULT_SOON_HOURS = 2;
const APPROVAL_SOON_MS = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export type LessonScheduleNotifyKind =
  | "moved"
  | "cancelled"
  | "to_recover"
  | "substitute";

type CourseNotifyRow = {
  id: string;
  name: string;
  course_kind: "individuale" | "gruppo" | "online";
  room_id: string | null;
  titular_member_id: string;
  status: string;
};

type LessonNotifyRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  room_id: string | null;
  placement: "scheduled" | "da_piazzare" | "da_recuperare";
  cancelled_at: string | null;
  kind: "regular" | "recupero" | "prova";
  makeup_member_id: string | null;
  original_starts_at: string | null;
};

function formatRomeDateTime(iso: string): string {
  const date = new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${date} alle ${time}`;
}

function whenLabel(
  startsAt: string | null,
  originalStartsAt: string | null,
): string {
  const iso = startsAt ?? originalStartsAt;
  if (!iso) return "data da definire";
  return formatRomeDateTime(iso);
}

function roomLabel(
  roomName: string | null | undefined,
  courseKind: CourseNotifyRow["course_kind"],
): string {
  const trimmed = roomName?.trim();
  if (trimmed) return trimmed;
  if (courseKind === "online") return "online";
  return "da definire";
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function positiveHours(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function scheduleCopy(kind: LessonScheduleNotifyKind): {
  subjectPrefix: string;
  familyLead: string;
  teacherLead: string;
} {
  switch (kind) {
    case "moved":
      return {
        subjectPrefix: "Lezione spostata",
        familyLead: "è stata spostata.",
        teacherLead: "è stata spostata.",
      };
    case "cancelled":
      return {
        subjectPrefix: "Lezione cancellata",
        familyLead: "è stata cancellata.",
        teacherLead: "è stata cancellata.",
      };
    case "to_recover":
      return {
        subjectPrefix: "Lezione da recuperare",
        familyLead:
          "è stata messa da recuperare. Vi comunicheremo il nuovo appuntamento.",
        teacherLead: "è stata messa da recuperare.",
      };
    case "substitute":
      return {
        subjectPrefix: "Supplenza",
        familyLead: "sarà tenuta da un docente supplente.",
        teacherLead: "avrà un docente supplente.",
      };
  }
}

function scheduleBody(params: {
  lead: string;
  courseName: string;
  when: string;
  room: string;
}): string {
  return [
    "Ciao,",
    "",
    `la lezione di ${params.courseName} del ${params.when} in ${params.room} ${params.lead}`,
    "",
    "MusicPro School",
  ].join("\n");
}

async function loadRoomName(
  client: NotifyClient,
  roomId: string | null,
): Promise<string | null> {
  if (!roomId) return null;
  const { data, error } = await client
    .from("rooms")
    .select("name")
    .eq("id", roomId)
    .maybeSingle();
  if (error || !data) return null;
  return data.name;
}

async function loadActiveEnrollmentMemberIds(
  client: NotifyClient,
  courseId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("course_enrollments")
    .select("member_id")
    .eq("course_id", courseId)
    .is("left_at", null);
  if (error) return [];
  return (data ?? []).map((row) => row.member_id);
}

async function familyMemberIdsForLesson(
  client: NotifyClient,
  lesson: Pick<LessonNotifyRow, "course_id" | "kind" | "makeup_member_id">,
): Promise<string[]> {
  if (lesson.kind === "recupero" && lesson.makeup_member_id) {
    return [lesson.makeup_member_id];
  }
  return loadActiveEnrollmentMemberIds(client, lesson.course_id);
}

async function notifyFamilies(
  client: NotifyClient,
  memberIds: string[],
  subject: string,
  body: string,
): Promise<void> {
  for (const memberId of memberIds) {
    await sendLessonFamilyEmail(client, memberId, { subject, body });
  }
}

async function loadTeacherEmails(
  client: NotifyClient,
  memberIds: string[],
): Promise<string[]> {
  const unique = [...new Set(memberIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await client
    .from("members")
    .select("email")
    .in("id", unique);
  if (error) return [];
  const emails = new Set<string>();
  for (const row of data ?? []) {
    const email = row.email?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return [...emails];
}

export async function notifyLessonScheduleChange(
  client: NotifyClient,
  input: {
    lessonId: string;
    kind: LessonScheduleNotifyKind;
    notifyTeachers?: boolean;
  },
): Promise<void> {
  const { data: lesson, error: lessonError } = await client
    .from("lessons")
    .select(
      "id, course_id, starts_at, room_id, placement, cancelled_at, kind, makeup_member_id, original_starts_at",
    )
    .eq("id", input.lessonId)
    .maybeSingle();

  if (lessonError || !lesson) return;
  if (lesson.cancelled_at && input.kind !== "cancelled") return;

  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id, name, course_kind, room_id, titular_member_id")
    .eq("id", lesson.course_id)
    .maybeSingle();
  if (courseError || !course) return;

  const roomName = await loadRoomName(client, lesson.room_id ?? course.room_id);
  const when = whenLabel(lesson.starts_at, lesson.original_starts_at);
  const room = roomLabel(roomName, course.course_kind);
  const copy = scheduleCopy(input.kind);
  const subject = `${copy.subjectPrefix} — ${course.name}`;
  const familyBody = scheduleBody({
    lead: copy.familyLead,
    courseName: course.name,
    when,
    room,
  });

  const memberIds = await familyMemberIdsForLesson(client, lesson);
  await notifyFamilies(client, memberIds, subject, familyBody);

  if (!input.notifyTeachers) return;

  // lessons / course_teachers non hanno colonna supplente o teacher override.
  const teacherEmails = await loadTeacherEmails(client, [
    course.titular_member_id,
  ]);
  const teacherBody = scheduleBody({
    lead: copy.teacherLead,
    courseName: course.name,
    when,
    room,
  });
  for (const to of teacherEmails) {
    await sendSingleEmail(client, { to, subject, body: teacherBody });
  }
}

export async function notifyCourseApproved(
  client: NotifyClient,
  input: { courseId: string },
): Promise<void> {
  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id, name, course_kind, room_id, titular_member_id")
    .eq("id", input.courseId)
    .maybeSingle();
  if (courseError || !course) return;

  const { data: firstLesson } = await client
    .from("lessons")
    .select(
      "id, course_id, starts_at, room_id, placement, cancelled_at, kind, makeup_member_id, original_starts_at",
    )
    .eq("course_id", input.courseId)
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .not("starts_at", "is", null)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const roomName = await loadRoomName(
    client,
    firstLesson?.room_id ?? course.room_id,
  );
  const room = roomLabel(roomName, course.course_kind);
  const subject = `Corso approvato — ${course.name}`;

  const lines = [
    "Ciao,",
    "",
    `il corso ${course.name} è stato approvato.`,
  ];

  if (firstLesson?.starts_at) {
    const when = formatRomeDateTime(firstLesson.starts_at);
    lines.push("", `Prima lezione: ${when}`, `Sala: ${room}`);
    const startsMs = Date.parse(firstLesson.starts_at);
    if (Number.isFinite(startsMs) && startsMs - Date.now() < APPROVAL_SOON_MS) {
      lines.push("", "La prima lezione parte presto.");
    }
  } else {
    lines.push("", "Ti comunicheremo data e ora della prima lezione.");
  }

  lines.push("", "A presto,", "MusicPro School");
  const body = lines.join("\n");

  const memberIds = await loadActiveEnrollmentMemberIds(client, course.id);
  await notifyFamilies(client, memberIds, subject, body);
}

export async function notifyPackPaymentLink(
  client: NotifyClient,
  input: { memberId: string; courseName: string; checkoutUrl: string },
): Promise<void> {
  const courseName = input.courseName.trim() || "il tuo corso";
  const subject = `Pacchetto lezioni da pagare — ${courseName}`;
  const body = [
    "Ciao,",
    "",
    `è disponibile il pacchetto lezioni per ${courseName}.`,
    "",
    "Puoi pagare da questo link:",
    input.checkoutUrl.trim(),
    "",
    "MusicPro School",
  ].join("\n");
  await sendLessonFamilyEmail(client, input.memberId, { subject, body });
}

export async function sendDueLessonReminders(
  client: NotifyClient,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  if (!process.env.RESEND_API_KEY?.trim()) {
    return { sent: 0, skipped: 0, errors: [] };
  }

  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  let dayHours = DEFAULT_DAY_HOURS;
  let soonHours = DEFAULT_SOON_HOURS;
  try {
    const settings = await getLessonSchoolSettings(client);
    dayHours = positiveHours(settings?.reminderDayHours, DEFAULT_DAY_HOURS);
    soonHours = positiveHours(settings?.reminderSoonHours, DEFAULT_SOON_HOURS);
  } catch (err) {
    errors.push(
      err instanceof Error
        ? err.message
        : "Impossibile caricare le soglie reminder.",
    );
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const dayUntilIso = new Date(now + dayHours * MS_PER_HOUR).toISOString();
  const soonMs = soonHours * MS_PER_HOUR;
  const dayMs = dayHours * MS_PER_HOUR;

  const { data: lessons, error: lessonsError } = await client
    .from("lessons")
    .select(
      "id, course_id, starts_at, room_id, placement, cancelled_at, kind, makeup_member_id, original_starts_at",
    )
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .gt("starts_at", nowIso)
    .lte("starts_at", dayUntilIso);

  if (lessonsError) {
    return {
      sent: 0,
      skipped: 0,
      errors: [...errors, lessonsError.message],
    };
  }

  const rows = (lessons ?? []) as LessonNotifyRow[];
  if (rows.length === 0) {
    return { sent, skipped, errors };
  }

  const lessonIds = rows.map((row) => row.id);
  const courseIds = [...new Set(rows.map((row) => row.course_id))];

  const [coursesRes, attendanceRes, logsRes] = await Promise.all([
    client
      .from("courses")
      .select("id, name, course_kind, room_id, titular_member_id, status")
      .in("id", courseIds),
    client
      .from("lesson_attendances")
      .select("lesson_id")
      .in("lesson_id", lessonIds),
    client
      .from("lesson_reminder_log")
      .select("lesson_id, kind")
      .in("lesson_id", lessonIds),
  ]);

  if (coursesRes.error) {
    return { sent: 0, skipped: 0, errors: [...errors, coursesRes.error.message] };
  }
  if (attendanceRes.error) {
    return {
      sent: 0,
      skipped: 0,
      errors: [...errors, attendanceRes.error.message],
    };
  }
  if (logsRes.error) {
    errors.push(logsRes.error.message);
  }

  const courseById = new Map(
    (coursesRes.data ?? []).map((row) => [row.id, row as CourseNotifyRow]),
  );
  const attended = new Set(
    (attendanceRes.data ?? []).map((row) => row.lesson_id),
  );
  const logged = new Set(
    (logsRes.data ?? []).map((row) => `${row.lesson_id}:${row.kind}`),
  );

  const roomIds = new Set<string>();
  for (const lesson of rows) {
    const course = courseById.get(lesson.course_id);
    const roomId = lesson.room_id ?? course?.room_id ?? null;
    if (roomId) roomIds.add(roomId);
  }

  const roomNameById = new Map<string, string>();
  if (roomIds.size > 0) {
    const { data: rooms, error: roomsError } = await client
      .from("rooms")
      .select("id, name")
      .in("id", [...roomIds]);
    if (roomsError) {
      errors.push(roomsError.message);
    } else {
      for (const room of rooms ?? []) {
        roomNameById.set(room.id, room.name);
      }
    }
  }

  const enrollmentsByCourse = new Map<string, string[]>();
  const { data: enrollments, error: enrollmentsError } = await client
    .from("course_enrollments")
    .select("course_id, member_id")
    .in("course_id", courseIds)
    .is("left_at", null);
  if (enrollmentsError) {
    errors.push(enrollmentsError.message);
  } else {
    for (const row of enrollments ?? []) {
      const list = enrollmentsByCourse.get(row.course_id) ?? [];
      list.push(row.member_id);
      enrollmentsByCourse.set(row.course_id, list);
    }
  }

  for (const lesson of rows) {
    if (!lesson.starts_at || lesson.cancelled_at) {
      skipped += 1;
      continue;
    }
    if (attended.has(lesson.id)) {
      skipped += 1;
      continue;
    }

    const startMs = Date.parse(lesson.starts_at);
    if (!Number.isFinite(startMs) || startMs <= now) {
      skipped += 1;
      continue;
    }

    const remaining = startMs - now;
    let kind: "day" | "soon" | null = null;
    if (remaining <= soonMs) kind = "soon";
    else if (remaining <= dayMs) kind = "day";
    if (!kind) {
      skipped += 1;
      continue;
    }
    if (logged.has(`${lesson.id}:${kind}`)) {
      skipped += 1;
      continue;
    }

    const course = courseById.get(lesson.course_id);
    if (!course) {
      skipped += 1;
      errors.push(`${lesson.id}: corso non trovato.`);
      continue;
    }
    if (course.status === "in_pausa" || course.status === "chiuso") {
      skipped += 1;
      continue;
    }

    const roomId = lesson.room_id ?? course.room_id;
    const room = roomLabel(
      roomId ? roomNameById.get(roomId) : null,
      course.course_kind,
    );
    const when = formatRomeDateTime(lesson.starts_at);
    const subject = `Promemoria lezione — ${course.name}`;
    const body = `Promemoria lezione ${course.name} il ${when} in ${room}.`;

    const memberIds =
      lesson.kind === "recupero" && lesson.makeup_member_id
        ? [lesson.makeup_member_id]
        : (enrollmentsByCourse.get(lesson.course_id) ?? []);

    if (memberIds.length === 0) {
      skipped += 1;
      continue;
    }

    let emailed = 0;
    for (const memberId of memberIds) {
      try {
        const result = await sendLessonFamilyEmail(client, memberId, {
          subject,
          body,
        });
        emailed += result.sent;
        if (result.warnings.length > 0) {
          errors.push(
            ...result.warnings.map((warning) => `${lesson.id}: ${warning}`),
          );
        }
      } catch (err) {
        errors.push(
          `${lesson.id}: ${err instanceof Error ? err.message : "invio fallito"}`,
        );
      }
    }

    if (emailed > 0) {
      const { error: insertError } = await client
        .from("lesson_reminder_log")
        .insert({ lesson_id: lesson.id, kind });
      if (insertError && !isUniqueViolation(insertError)) {
        errors.push(`${lesson.id}: ${insertError.message}`);
      }
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { sent, skipped, errors };
}
