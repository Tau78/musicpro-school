import { redirect } from "next/navigation";

import {
  expireDueHolds,
  getCourse,
  getLessonSchoolSettings,
  listPendingCourseCloseRequests,
  listPendingCourses,
  listPendingLessonChangeRequests,
  listRooms,
  listTeacherCashAdvances,
  listUnplacedLessons,
  minutesToTimeLabel,
  todayInRome,
  type CourseDetail,
  type IsoWeekday,
  type LessonParkedReason,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CashAdvanceActions } from "@/components/lezioni/cash-advance-actions";
import { ChangeRequestActions } from "@/components/lezioni/change-request-actions";
import { CloseRequestActions } from "@/components/lezioni/close-request-actions";
import { CourseQueueActions } from "@/components/lezioni/course-queue-actions";
import { PlaceLessonForm } from "@/components/lezioni/place-lesson-form";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
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

const PARKED_REASON_LABELS: Record<LessonParkedReason, string> = {
  giustificato: "Giustificato",
  cancellata_scuola: "Cancellata scuola",
  docente_assente: "Docente assente",
};

const SCOPE_LABELS = {
  this: "Solo questa lezione",
  future: "Questa e le future",
} as const;

function roomLabel(
  roomId: string | null,
  roomsById: Map<string, string>,
  online: boolean,
): string {
  if (online) return "Online";
  if (!roomId) return "Sala non assegnata";
  return roomsById.get(roomId) ?? "Sala non trovata";
}

function changeRequestRoomLabel(
  roomId: string | null,
  roomsById: Map<string, string>,
): string {
  if (!roomId) return "—";
  return roomsById.get(roomId) ?? "—";
}

function changeRequestWhenLabel(iso: string | null): string {
  if (!iso) return "—";
  return formatDateTimeIt(iso);
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
  let changeRequests: Awaited<
    ReturnType<typeof listPendingLessonChangeRequests>
  > = [];
  let rooms: Awaited<ReturnType<typeof listRooms>> = [];
  let settings: Awaited<ReturnType<typeof getLessonSchoolSettings>> = null;
  let cashAdvances: Awaited<ReturnType<typeof listTeacherCashAdvances>> = [];
  let closeRequests: Awaited<
    ReturnType<typeof listPendingCourseCloseRequests>
  > = [];
  const detailsById = new Map<string, CourseDetail>();
  const today = todayInRome();

  try {
    const [
      pendingRows,
      unplacedRows,
      requestRows,
      roomRows,
      schoolSettings,
      advanceRows,
      closeRequestRows,
    ] =
      await Promise.all([
        listPendingCourses(supabase),
        listUnplacedLessons(supabase),
        listPendingLessonChangeRequests(supabase),
        listRooms(supabase),
        getLessonSchoolSettings(supabase),
        listTeacherCashAdvances(supabase, { status: "pending" }),
        listPendingCourseCloseRequests(supabase),
      ]);
    pending = pendingRows;
    unplaced = unplacedRows;
    changeRequests = requestRows;
    rooms = roomRows;
    settings = schoolSettings;
    cashAdvances = advanceRows;
    closeRequests = closeRequestRows;

    const courseIds = [
      ...new Set([
        ...pending.map((course) => course.id),
        ...unplaced.map((lesson) => lesson.courseId),
        ...changeRequests.map((request) => request.courseId),
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
      <SettingsPageHeader
        title="Da fare"
        description="Corsi da approvare, lezioni da calendarizzare, richieste di spostamento e anticipi in attesa."
      />

      {!expireResult.success ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {expireResult.errorMessage ??
            "Impossibile liberare le sale scadute."}
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

      <CashAdvanceActions
        advances={cashAdvances}
        actorMemberId={member.id}
      />

      <CloseRequestActions
        requests={closeRequests}
        actorMemberId={member.id}
      />

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
                        Quando
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
                        Riservata fino a
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
                    weeklyDow={course.weeklyDow}
                    weeklyStartMinute={course.weeklyStartMinute}
                    roomId={course.roomId}
                    rooms={roomOptions}
                    online={course.courseKind === "online"}
                    slotStepMinutes={slotStepMinutes}
                    defaultHoldHours={settings?.holdHours ?? 48}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Da mettere in calendario
        </h3>
        {unplaced.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
            Nessuna lezione da mettere in calendario.
          </p>
        ) : (
          <ul className="space-y-3">
            {unplaced.map((lesson) => {
              const detail = detailsById.get(lesson.courseId);
              const online = detail?.courseKind === "online";
              const isRecovery = lesson.placement === "da_recuperare";
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
                  {isRecovery ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                        Da recuperare
                      </span>
                      {lesson.parkedReason ? (
                        <span className="text-neutral-600">
                          {PARKED_REASON_LABELS[lesson.parkedReason]}
                        </span>
                      ) : null}
                      {lesson.originalStartsAt ? (
                        <span className="text-neutral-500">
                          Originale: {formatDateTimeIt(lesson.originalStartsAt)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <PlaceLessonForm
                    lessonId={lesson.id}
                    rooms={roomOptions}
                    requiresRoom={!online}
                    defaultRoomId={lesson.roomId}
                    actor={{
                      memberId: member.id,
                      isStaff: true,
                      canReschedule: true,
                    }}
                    slotStepMinutes={slotStepMinutes}
                    minDate={isRecovery ? today : undefined}
                    label={isRecovery ? "Nuova data e ora" : undefined}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Richieste spostamento
        </h3>
        {changeRequests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
            Nessuna richiesta di spostamento.
          </p>
        ) : (
          <ul className="space-y-3">
            {changeRequests.map((request) => {
              const detail = detailsById.get(request.courseId);
              return (
                <li
                  key={request.id}
                  className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-neutral-900">
                      {detail?.name ?? "Corso"}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {SCOPE_LABELS[request.scope] ?? request.scope}
                    </p>
                  </div>
                  <dl className="grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Da
                      </dt>
                      <dd>
                        {changeRequestWhenLabel(request.originalStartsAt)}
                        {" · "}
                        {changeRequestRoomLabel(
                          request.originalRoomId,
                          roomsById,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        A
                      </dt>
                      <dd>
                        {formatDateTimeIt(request.requestedStartsAt)}
                        {" · "}
                        {changeRequestRoomLabel(
                          request.requestedRoomId,
                          roomsById,
                        )}
                      </dd>
                    </div>
                    {request.note ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-neutral-500">
                          Nota
                        </dt>
                        <dd>{request.note}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <ChangeRequestActions
                    requestId={request.id}
                    actorMemberId={member.id}
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
