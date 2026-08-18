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
  teachers = [],
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
  teachers?: { id: string; label: string }[];
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
  const canPlace = Boolean(actorMemberId) && (isStaff || canReschedule);
  const today = todayInRome();
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna ai corsi
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold text-[var(--brand)]">
            {course.name}
          </h2>
          {course.isTrial ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${courseTrialBadgeClass()}`}
            >
              {courseTrialLabel()}
            </span>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${courseStatusClass(course.status)}`}
          >
            {courseStatusLabel(course.status)}
          </span>
        </div>
      </div>

      {pendingNote && course.status === "in_attesa" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Approva dalla Coda
        </p>
      ) : null}

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Dettaglio
        </legend>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
        </dl>
      </fieldset>

      {course.isTrial && actorMemberId ? (
        <TrialActions
          course={course}
          lessons={lessons}
          rooms={rooms}
          actorMemberId={actorMemberId}
          isStaff={isStaff}
          canCreateCourses={canCreateCourses}
        />
      ) : null}

      {isStaff &&
      !course.isTrial &&
      actorMemberId &&
      (course.status === "attivo" || course.status === "in_pausa") ? (
        <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Cambio titolare
          </legend>
          <TransferTitularForm
            key={course.titularMemberId}
            courseId={course.id}
            currentTitularId={course.titularMemberId}
            actorMemberId={actorMemberId}
            teachers={teachers}
          />
        </fieldset>
      ) : null}

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Iscritti
        </legend>
        {course.enrollments.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessun iscritto.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {course.enrollments.map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-medium text-neutral-900">
                  {`${enrollment.lastName} ${enrollment.firstName}`.trim()}
                </span>
                {enrollment.email ? (
                  <span className="text-neutral-500">{enrollment.email}</span>
                ) : null}
                {actorMemberId &&
                !course.isTrial &&
                !enrollment.leftAt &&
                course.status === "attivo" ? (
                  <div className="w-full pt-2">
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
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Lezioni
        </legend>
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
                Boolean(actorMemberId) &&
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
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Da piazzare
                    </span>
                  ) : null}
                  {isRecovery ? (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                      Da recuperare
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
                      className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-neutral-50"
                    >
                      {rowInner}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {rowInner}
                    </div>
                  )}
                  {canOpenAttendance && expanded && actorMemberId ? (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
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
      </fieldset>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
