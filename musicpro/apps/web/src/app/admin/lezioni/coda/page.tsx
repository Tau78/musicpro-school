import Link from "next/link";
import { redirect } from "next/navigation";

import {
  expireDueHolds,
  getCourse,
  getLessonSchoolSettings,
  listPendingCourses,
  listRooms,
  listUnplacedLessons,
  minutesToTimeLabel,
  type CourseDetail,
  type IsoWeekday,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseQueueActions } from "@/components/lezioni/course-queue-actions";
import { PlaceLessonForm } from "@/components/lezioni/place-lesson-form";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

const DAY_LABELS: Record<IsoWeekday, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  7: "Domenica",
};

function formatIsoDateIt(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("it-IT");
}

function formatDateTimeIt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function titularLabel(detail: CourseDetail | undefined): string {
  if (!detail?.titular) return "—";
  return `${detail.titular.lastName} ${detail.titular.firstName}`.trim() || "—";
}

function roomLabel(
  roomId: string | null,
  roomsById: Map<string, string>,
  online: boolean,
): string {
  if (online) return "Online";
  if (!roomId) return "Sala non assegnata";
  return roomsById.get(roomId) ?? "Sala non trovata";
}

export default async function AdminLezioniCodaPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  const expireResult = await expireDueHolds(supabase);

  let loadError: string | null = null;
  let pending: Awaited<ReturnType<typeof listPendingCourses>> = [];
  let unplaced: Awaited<ReturnType<typeof listUnplacedLessons>> = [];
  let rooms: Awaited<ReturnType<typeof listRooms>> = [];
  let settings: Awaited<ReturnType<typeof getLessonSchoolSettings>> = null;
  const detailsById = new Map<string, CourseDetail>();

  try {
    const [pendingRows, unplacedRows, roomRows, schoolSettings] =
      await Promise.all([
        listPendingCourses(supabase),
        listUnplacedLessons(supabase),
        listRooms(supabase),
        getLessonSchoolSettings(supabase),
      ]);
    pending = pendingRows;
    unplaced = unplacedRows;
    rooms = roomRows;
    settings = schoolSettings;

    const courseIds = [
      ...new Set([
        ...pending.map((course) => course.id),
        ...unplaced.map((lesson) => lesson.courseId),
      ]),
    ];
    const details = await Promise.all(
      courseIds.map((id) => getCourse(supabase, id)),
    );
    for (const detail of details) {
      if (detail) detailsById.set(detail.id, detail);
    }
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Impossibile caricare la coda lezioni.";
  }

  const roomsById = new Map(rooms.map((room) => [room.id, room.name]));
  const roomOptions = rooms.map((room) => ({ id: room.id, name: room.name }));
  const slotStepMinutes = settings?.slotGranularityMinutes ?? 15;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Coda</h2>
        <p className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/lezioni/corsi"
            className="text-[var(--brand)] underline-offset-2 hover:underline"
          >
            Corsi
          </Link>
          <Link
            href="/admin/lezioni"
            className="text-[var(--brand)] underline-offset-2 hover:underline"
          >
            Lezioni
          </Link>
        </p>
      </div>

      {!expireResult.success ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {expireResult.errorMessage ??
            "Impossibile scadere gli hold in ritardo."}
        </p>
      ) : null}
      {expireResult.warnings?.length ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {expireResult.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </p>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Da approvare
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
            Nessun corso in attesa di approvazione.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((course) => {
              const detail = detailsById.get(course.id);
              const slot = `${DAY_LABELS[course.weeklyDow]} ${minutesToTimeLabel(course.weeklyStartMinute)}`;
              return (
                <li
                  key={course.id}
                  className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-neutral-900">{course.name}</p>
                    <p className="text-sm text-neutral-600">
                      Titolare: {titularLabel(detail)}
                    </p>
                  </div>
                  <dl className="grid gap-2 text-sm text-neutral-600 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Slot
                      </dt>
                      <dd>{slot}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Sala
                      </dt>
                      <dd>
                        {roomLabel(
                          course.roomId,
                          roomsById,
                          course.courseKind === "online",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Inizio
                      </dt>
                      <dd>{formatIsoDateIt(course.startsOn)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Hold fino a
                      </dt>
                      <dd>
                        {course.holdUntil
                          ? formatDateTimeIt(course.holdUntil)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <CourseQueueActions
                    courseId={course.id}
                    actorMemberId={member.id}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Da piazzare
        </h3>
        {unplaced.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
            Nessuna lezione da piazzare.
          </p>
        ) : (
          <ul className="space-y-3">
            {unplaced.map((lesson) => {
              const detail = detailsById.get(lesson.courseId);
              const online = detail?.courseKind === "online";
              return (
                <li
                  key={lesson.id}
                  className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-neutral-900">
                      {detail?.name ?? "Corso"}
                      <span className="ml-2 text-sm font-normal text-neutral-600">
                        #{lesson.sequenceNumber}
                      </span>
                    </p>
                    <p className="text-sm text-neutral-600">
                      Sala:{" "}
                      {roomLabel(lesson.roomId, roomsById, Boolean(online))}
                    </p>
                  </div>
                  <PlaceLessonForm
                    lessonId={lesson.id}
                    rooms={roomOptions}
                    requiresRoom={!online}
                    defaultRoomId={lesson.roomId}
                    slotStepMinutes={slotStepMinutes}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
