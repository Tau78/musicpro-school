"use client";

/**
 * Colori allineati al calendario (fetta 6):
 * - individuale: bg-amber-100 border-amber-300
 * - gruppo: bg-sky-100 border-sky-300
 * - online: bg-violet-100 border-violet-300
 * - prova (isTrial): bg-rose-100 border-rose-300
 * - in_attesa: bordo tratteggiato amber
 * Chrome admin: navy --brand, card rounded-xl
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  getRomeMinutesFromMidnight,
  minutesToTimeLabel,
  todayInRome,
} from "@musicpro/database";

import { LessonAttendancePanel } from "@/components/lezioni/lesson-attendance-panel";
import type { CalendarLesson } from "@/components/lezioni/lessons-calendar";
import { LessonsPrintButton } from "@/components/lezioni/lessons-print-button";

export type OggiLesson = CalendarLesson & { hasAttendance?: boolean };

export interface LessonsOggiProps {
  lessons: OggiLesson[];
  arrears?: OggiLesson[];
  onOpenLesson?: (lessonId: string) => void;
  courseDetailBasePath?: string;
  actorMemberId?: string;
  isStaff?: boolean;
}

export function lessonCourseId(lesson: CalendarLesson): string {
  if (lesson.courseId) return lesson.courseId;
  if (lesson.id.startsWith("hold:")) return lesson.id.slice(5);
  return lesson.id;
}

function isHoldLesson(lesson: OggiLesson): boolean {
  return lesson.id.startsWith("hold:") || lesson.courseStatus === "in_attesa";
}

function filterArrearsLessons(lessons: OggiLesson[]): OggiLesson[] {
  return lessons.filter(
    (lesson) => !lesson.hasAttendance && !isHoldLesson(lesson),
  );
}

export function LessonsOggi({
  lessons,
  arrears = [],
  onOpenLesson,
  courseDetailBasePath,
  actorMemberId,
  isStaff = false,
}: LessonsOggiProps) {
  const router = useRouter();
  const today = todayInRome();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const canExpand = Boolean(actorMemberId);

  function openLesson(lesson: OggiLesson) {
    if (canExpand) {
      if (isHoldLesson(lesson)) return;
      setExpandedId((current) => (current === lesson.id ? null : lesson.id));
      return;
    }
    if (onOpenLesson) {
      onOpenLesson(lesson.id);
      return;
    }
    if (courseDetailBasePath) {
      router.push(`${courseDetailBasePath}/${lessonCourseId(lesson)}`);
    }
  }

  const todayRows = sortByStart(
    lessons.filter(
      (lesson) =>
        lesson.startsAt && romeDateFromIso(lesson.startsAt) === today,
    ),
  );
  const arrearsRows = sortByStart(filterArrearsLessons(arrears));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <LessonsPrintButton label="Stampa registro del giorno" />
      </div>
      {todayRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          Nessuna lezione oggi.
        </p>
      ) : (
        <LessonOggiList
          rows={todayRows}
          expandedId={expandedId}
          canExpand={canExpand}
          actorMemberId={actorMemberId}
          isStaff={isStaff}
          courseDetailBasePath={courseDetailBasePath}
          onOpen={openLesson}
          onSaved={() => router.refresh()}
        />
      )}

      {arrearsRows.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-[var(--brand)]">
            Arretrati
          </h3>
          <LessonOggiList
            rows={arrearsRows}
            expandedId={expandedId}
            canExpand={canExpand}
            actorMemberId={actorMemberId}
            isStaff={isStaff}
            courseDetailBasePath={courseDetailBasePath}
            onOpen={openLesson}
            onSaved={() => router.refresh()}
            showDate
          />
        </section>
      ) : null}
    </div>
  );
}

function LessonOggiList({
  rows,
  expandedId,
  canExpand,
  actorMemberId,
  isStaff,
  courseDetailBasePath,
  onOpen,
  onSaved,
  showDate = false,
}: {
  rows: OggiLesson[];
  expandedId: string | null;
  canExpand: boolean;
  actorMemberId?: string;
  isStaff: boolean;
  courseDetailBasePath?: string;
  onOpen: (lesson: OggiLesson) => void;
  onSaved: () => void;
  showDate?: boolean;
}) {
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {rows.map((lesson) => {
        const start = lesson.startsAt
          ? minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.startsAt))
          : "—";
        const end = lesson.endsAt
          ? minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.endsAt))
          : null;
        const name =
          lesson.courseName.trim() || lesson.studentNames[0] || "Lezione";
        const students = lesson.studentNames.filter(Boolean).join(", ");
        const room =
          lesson.courseKind === "online" ? "Online" : (lesson.roomName ?? "—");
        const hold = isHoldLesson(lesson);
        const expanded = expandedId === lesson.id;
        const clickable =
          canExpand || Boolean(onOpen || courseDetailBasePath);
        const dayLabel =
          showDate && lesson.startsAt ? romeDayLabel(lesson.startsAt) : null;

        const inner = (
          <>
            <KindDot lesson={lesson} />
            <p className="w-24 shrink-0 text-sm font-semibold tabular-nums text-[var(--brand)]">
              {end ? `${start}–${end}` : start}
            </p>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-neutral-900">
                {dayLabel ? (
                  <>
                    <span className="font-normal text-neutral-500">
                      {dayLabel}
                    </span>{" "}
                  </>
                ) : null}
                <span className="text-neutral-500">#{lesson.sequenceNumber}</span>{" "}
                {name}
              </p>
              <p className="truncate text-sm text-neutral-500">
                {students || "—"}
                <span className="text-neutral-300"> · </span>
                {room}
              </p>
            </div>
            {hold ? null : lesson.hasAttendance ? (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                OK
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Da inserire
              </span>
            )}
          </>
        );

        return (
          <li key={lesson.id}>
            <div className="flex items-stretch">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onOpen(lesson)}
                  aria-expanded={canExpand ? expanded : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  {inner}
                </div>
              )}
              {courseDetailBasePath ? (
                <Link
                  href={`${courseDetailBasePath}/${lessonCourseId(lesson)}`}
                  className="flex shrink-0 items-center px-3 text-xs font-medium text-[var(--brand)] hover:bg-neutral-50 hover:underline"
                >
                  Corso →
                </Link>
              ) : null}
            </div>
            {canExpand && expanded && actorMemberId ? (
              <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-4">
                <LessonAttendancePanel
                  lessonId={lesson.id}
                  actorMemberId={actorMemberId}
                  isStaff={isStaff}
                  onSaved={onSaved}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function KindDot({ lesson }: { lesson: CalendarLesson }) {
  const dashed = lesson.courseStatus === "in_attesa";
  const tone = lesson.isTrial
    ? "bg-rose-100 border-rose-300"
    : lesson.courseKind === "gruppo"
      ? "bg-sky-100 border-sky-300"
      : lesson.courseKind === "online"
        ? "bg-violet-100 border-violet-300"
        : "bg-amber-100 border-amber-300";
  return (
    <span
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 rounded-full border ${tone} ${
        dashed ? "border-dashed border-amber-400" : ""
      }`}
    />
  );
}

function sortByStart(lessons: OggiLesson[]): OggiLesson[] {
  return lessons.slice().sort((a, b) => {
    const aMin = a.startsAt ? getRomeMinutesFromMidnight(a.startsAt) : 0;
    const bMin = b.startsAt ? getRomeMinutesFromMidnight(b.startsAt) : 0;
    const aDay = a.startsAt ? romeDateFromIso(a.startsAt) : "";
    const bDay = b.startsAt ? romeDateFromIso(b.startsAt) : "";
    if (aDay !== bDay) return aDay.localeCompare(bDay);
    return aMin - bMin;
  });
}

function romeDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function romeDayLabel(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}
