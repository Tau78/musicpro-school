"use client";

import Link from "next/link";
import { useState } from "react";

import {
  formatBookingDateTime,
  formatEuro,
  todayInRome,
  type CourseDetail,
  type Lesson,
} from "@musicpro/database";

import {
  courseKindLabel,
  courseSlotLabel,
  courseStatusClass,
  courseStatusLabel,
  courseTrialBadgeClass,
  courseTrialLabel,
} from "@/components/lezioni/course-labels";
import { CashCollectionForm } from "@/components/lezioni/cash-collection-form";
import { CourseLifecycleActions } from "@/components/lezioni/course-lifecycle-actions";
import { LessonAttendancePanel } from "@/components/lezioni/lesson-attendance-panel";
import { PlaceLessonForm } from "@/components/lezioni/place-lesson-form";
import { TransferTitularForm } from "@/components/lezioni/transfer-titular-form";
import { TrialActions } from "@/components/lezioni/trial-actions";

export function CourseDetailView({
  course,
  lessons,
  roomsById,
  rooms = [],
  backHref,
  pendingNote = false,
  isStaff = false,
  showPrice = true,
  actorMemberId,
  canCreateCourses = false,
  canReschedule = false,
  canCloseCourses = false,
  teachers = [],
  readOnly = false,
  slotStepMinutes = 15,
}: {
  course: CourseDetail;
  lessons: Lesson[];
  roomsById: Record<string, string>;
  rooms?: { id: string; name: string }[];
  backHref: string;
  pendingNote?: boolean;
  isStaff?: boolean;
  showPrice?: boolean;
  actorMemberId?: string;
  canCreateCourses?: boolean;
  canReschedule?: boolean;
  canCloseCourses?: boolean;
  teachers?: { id: string; label: string }[];
  /** Coordinatore: stesso dettaglio, nessuna azione. */
  readOnly?: boolean;
  slotStepMinutes?: number;
}) {
  const titularLabel = course.titular
    ? `${course.titular.lastName} ${course.titular.firstName}`.trim()
    : "—";
  const roomLabel =
    course.courseKind === "online"
      ? "Online"
      : course.roomId
        ? (roomsById[course.roomId] ?? "—")
        : "—";
  const canMutate = !readOnly && Boolean(actorMemberId);
  const canPlace =
    canMutate &&
    (isStaff || canReschedule) &&
    course.status === "attivo";
  const today = todayInRome();
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  return (
    <div className="space-y-4 pb-2">
      <div>
        <Link
          href={backHref}
          className="text-xs font-medium text-[var(--brand)] hover:underline"
        >
          ← Torna ai corsi
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold leading-tight text-[var(--brand)] sm:text-2xl">
            {course.name}
          </h2>
          {readOnly ? (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
              Che coordino
            </span>
          ) : null}
          {course.isTrial ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${courseTrialBadgeClass()}`}
            >
              {courseTrialLabel()}
            </span>
          ) : null}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${courseStatusClass(course.status)}`}
          >
            {courseStatusLabel(course.status)}
          </span>
        </div>
      </div>

      {pendingNote && course.status === "in_attesa" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-sm ring-1 ring-amber-100">
          Approva dalla Coda
        </p>
      ) : null}

      <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          Dettaglio
        </h3>
        <dl className="grid grid-cols-2 gap-3">
          <Row label="Materia" value={course.subjectName ?? "—"} />
          <Row label="Tipo" value={courseKindLabel(course.courseKind)} />
          <Row label="Titolare" value={titularLabel} />
          <Row label="Sala" value={roomLabel} />
          <Row label="Slot" value={courseSlotLabel(course)} />
          <Row label="Inizio" value={course.startsOn} />
          {course.courseKind === "gruppo" ? (
            <Row label="Capienza" value={String(course.maxStudents)} />
          ) : null}
          {showPrice ? (
            <Row label="Prezzo" value={formatEuro(course.priceEur)} />
          ) : null}
          {course.closedOn ? (
            <Row label="Chiuso il" value={course.closedOn} />
          ) : null}
        </dl>
      </section>

      {canMutate && actorMemberId && !course.isTrial ? (
        <CourseLifecycleActions
          course={course}
          actorMemberId={actorMemberId}
          isStaff={isStaff}
          canCloseCourses={isStaff || canCloseCourses}
        />
      ) : null}

      {readOnly ? (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900 shadow-sm ring-1 ring-violet-100">
          Vista coordinatore: puoi consultare il corso, non modificare nulla.
        </p>
      ) : null}

      {course.isTrial && actorMemberId && !readOnly ? (
        <TrialActions
          course={course}
          lessons={lessons}
          rooms={rooms}
          actorMemberId={actorMemberId}
          isStaff={isStaff}
          canCreateCourses={canCreateCourses}
          slotStepMinutes={slotStepMinutes}
        />
      ) : null}

      {isStaff &&
      !readOnly &&
      !course.isTrial &&
      actorMemberId &&
      (course.status === "attivo" || course.status === "in_pausa") ? (
        <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
            Cambio titolare
          </h3>
          <TransferTitularForm
            key={course.titularMemberId}
            courseId={course.id}
            currentTitularId={course.titularMemberId}
            actorMemberId={actorMemberId}
            teachers={teachers}
          />
        </section>
      ) : null}

      <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          Iscritti
        </h3>
        {course.enrollments.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessun iscritto.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {course.enrollments.map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-semibold text-neutral-900">
                  {`${enrollment.lastName} ${enrollment.firstName}`.trim()}
                </span>
                {enrollment.email ? (
                  <span className="text-xs text-neutral-500">
                    {enrollment.email}
                  </span>
                ) : null}
                {enrollment.leftAt ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                    Uscito
                  </span>
                ) : null}
                {canMutate &&
                actorMemberId &&
                !course.isTrial &&
                !enrollment.leftAt &&
                course.status === "attivo" ? (
                  <div className="w-full pt-1.5">
                    <CashCollectionForm
                      enrollmentId={enrollment.id}
                      actorMemberId={actorMemberId}
                      studentLabel={`${enrollment.lastName} ${enrollment.firstName}`.trim()}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          Lezioni
        </h3>
        {lessons.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessuna lezione.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {lessons.map((lesson) => {
              const sala =
                course.courseKind === "online"
                  ? "Online"
                  : lesson.roomId
                    ? (roomsById[lesson.roomId] ?? "—")
                    : "—";
              const when =
                lesson.startsAt && lesson.endsAt
                  ? formatBookingDateTime(lesson.startsAt, lesson.endsAt)
                  : "—";
              const unplaced =
                lesson.placement === "da_piazzare" ||
                lesson.placement === "da_recuperare";
              const isRecovery = lesson.placement === "da_recuperare";
              const canOpenAttendance =
                canMutate &&
                lesson.placement === "scheduled" &&
                Boolean(lesson.startsAt);
              const expanded = expandedLessonId === lesson.id;
              const rowInner = (
                <>
                  <span className="w-8 shrink-0 text-neutral-400">
                    #{lesson.sequenceNumber}
                  </span>
                  <span className="min-w-0 flex-1 text-neutral-900">
                    {when}
                  </span>
                  <span className="text-neutral-500">{sala}</span>
                  {lesson.placement === "da_piazzare" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      Da piazzare
                    </span>
                  ) : null}
                  {isRecovery ? (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                      Da recuperare
                    </span>
                  ) : null}
                  {lesson.cancelledAt ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                      Annullata
                    </span>
                  ) : null}
                  {isRecovery && lesson.originalStartsAt ? (
                    <span className="text-neutral-500">
                      Originale:{" "}
                      {new Date(lesson.originalStartsAt).toLocaleString(
                        "it-IT",
                        {
                          timeZone: "Europe/Rome",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  ) : null}
                </>
              );
              return (
                <li key={lesson.id} className="space-y-2 py-2 text-sm">
                  {canOpenAttendance ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedLessonId((current) =>
                          current === lesson.id ? null : lesson.id,
                        )
                      }
                      className="-mx-1.5 flex w-[calc(100%+0.75rem)] flex-wrap items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-neutral-50"
                    >
                      {rowInner}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {rowInner}
                    </div>
                  )}
                  {canOpenAttendance && expanded && actorMemberId ? (
                    <div className="rounded-lg bg-neutral-50 px-3 py-2.5 ring-1 ring-black/5">
                      <LessonAttendancePanel
                        lessonId={lesson.id}
                        actorMemberId={actorMemberId}
                        isStaff={isStaff}
                      />
                    </div>
                  ) : null}
                  {canPlace && unplaced && actorMemberId ? (
                    <PlaceLessonForm
                      lessonId={lesson.id}
                      rooms={rooms}
                      requiresRoom={course.courseKind !== "online"}
                      defaultRoomId={lesson.roomId ?? course.roomId}
                      slotStepMinutes={slotStepMinutes}
                      actor={{
                        memberId: actorMemberId,
                        isStaff,
                        canReschedule: isStaff || canReschedule,
                      }}
                      minDate={isRecovery ? today : undefined}
                      label={isRecovery ? "Nuova data e ora" : undefined}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="truncate text-sm font-semibold text-neutral-900">
        {value}
      </dd>
    </div>
  );
}
