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
import { useMemo, useState } from "react";

import {
  cancelLessonAsSchool,
  getLessonRoster,
  getRomeMinutesFromMidnight,
  minutesToTimeLabel,
  saveLessonAttendance,
  todayInRome,
  type AttendanceStatus,
} from "@musicpro/database";

import type { CalendarLesson } from "@/components/lezioni/lessons-calendar";
import { LessonsPrintButton } from "@/components/lezioni/lessons-print-button";
import {
  lessonCourseId,
  type OggiLesson,
} from "@/lib/lezioni/oggi-lesson";
import { createClient } from "@/lib/supabase/client";
import { logUsage } from "@/lib/usage-log";

export type { OggiLesson };

export interface LessonsOggiProps {
  lessons: OggiLesson[];
  arrears?: OggiLesson[];
  onOpenLesson?: (lessonId: string) => void;
  courseDetailBasePath?: string;
  actorMemberId?: string;
  isStaff?: boolean;
}

function isHoldLesson(lesson: OggiLesson): boolean {
  return lesson.id.startsWith("hold:") || lesson.courseStatus === "in_attesa";
}

function filterArrearsLessons(lessons: OggiLesson[]): OggiLesson[] {
  return lessons.filter(
    (lesson) => !lesson.hasAttendance && !isHoldLesson(lesson),
  );
}

function studentLabel(lesson: OggiLesson): string {
  const students = lesson.studentNames.filter(Boolean).join(", ");
  if (students) return students;
  return lesson.courseName.trim() || "Lezione";
}

function whenLabel(lesson: OggiLesson, withDate: boolean): string {
  if (!lesson.startsAt) return "—";
  const time = minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.startsAt));
  if (!withDate) return time;
  return `${romeDayLabel(lesson.startsAt)} · ${time}`;
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

  const todayRows = sortByStart(
    lessons.filter(
      (lesson) =>
        lesson.startsAt && romeDateFromIso(lesson.startsAt) === today,
    ),
  );
  const arrearsRows = sortByStart(filterArrearsLessons(arrears));

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 max-w-full justify-end">
        <LessonsPrintButton label="Stampa registro del giorno" />
      </div>
      {todayRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          Nessuna lezione oggi.
        </p>
      ) : (
        <LessonOggiList
          rows={todayRows}
          actorMemberId={actorMemberId}
          isStaff={isStaff}
          courseDetailBasePath={courseDetailBasePath}
          onOpenLesson={onOpenLesson}
          onSaved={() => router.refresh()}
          showDate={false}
        />
      )}

      {arrearsRows.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-[var(--brand)]">
            Da segnare
          </h3>
          <LessonOggiList
            rows={arrearsRows}
            actorMemberId={actorMemberId}
            isStaff={isStaff}
            courseDetailBasePath={courseDetailBasePath}
            onOpenLesson={onOpenLesson}
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
  actorMemberId,
  isStaff,
  courseDetailBasePath,
  onOpenLesson,
  onSaved,
  showDate = false,
}: {
  rows: OggiLesson[];
  actorMemberId?: string;
  isStaff: boolean;
  courseDetailBasePath?: string;
  onOpenLesson?: (lessonId: string) => void;
  onSaved: () => void;
  showDate?: boolean;
}) {
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {rows.map((lesson) => (
        <LessonOggiRow
          key={lesson.id}
          lesson={lesson}
          actorMemberId={actorMemberId}
          isStaff={isStaff}
          courseDetailBasePath={courseDetailBasePath}
          onOpenLesson={onOpenLesson}
          onSaved={onSaved}
          showDate={showDate}
        />
      ))}
    </ul>
  );
}

function LessonOggiRow({
  lesson,
  actorMemberId,
  isStaff,
  courseDetailBasePath,
  onOpenLesson,
  onSaved,
  showDate,
}: {
  lesson: OggiLesson;
  actorMemberId?: string;
  isStaff: boolean;
  courseDetailBasePath?: string;
  onOpenLesson?: (lessonId: string) => void;
  onSaved: () => void;
  showDate: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<"presente" | "assente" | "annulla" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const hold = isHoldLesson(lesson);
  const canMark = Boolean(actorMemberId) && !hold && !lesson.hasAttendance;
  const name = studentLabel(lesson);
  const when = whenLabel(lesson, showDate);

  async function markStatus(status: AttendanceStatus) {
    if (!actorMemberId || busy) return;
    setError(null);
    setBusy(status === "presente" ? "presente" : "assente");
    try {
      const roster = await getLessonRoster(supabase, lesson.id, {
        memberId: actorMemberId,
        isStaff,
      });
      if (!roster) throw new Error("Lezione non trovata.");
      if (!roster.canEdit) {
        throw new Error(
          roster.editBlockReason || "Non è possibile modificare le presenze.",
        );
      }
      if (roster.students.length === 0) {
        throw new Error("Nessun allievo in questa lezione.");
      }
      const result = await saveLessonAttendance(supabase, {
        lessonId: lesson.id,
        actorMemberId,
        isStaff,
        rows: roster.students.map((student) => ({
          memberId: student.memberId,
          status,
        })),
      });
      if (!result.success) {
        throw new Error(result.errorMessage ?? "Impossibile salvare le presenze.");
      }
      logUsage("lezioni.attendance.saved", {
        properties: {
          lessonId: lesson.id,
          source: "oggi_da_segnare",
          status,
        },
      });
      const opened = result.packOpenedEnrollmentIds ?? [];
      for (const enrollmentId of opened) {
        try {
          await fetch("/api/lezioni/pack-payment/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ enrollmentId, notify: true }),
          });
        } catch {
          /* link rette resta in admin */
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelLesson() {
    if (!actorMemberId || busy) return;
    const ok = window.confirm(
      `Annullare la lezione di ${name} (${when})?\nL'orario torna libero e la lezione va in recupero.`,
    );
    if (!ok) return;
    setError(null);
    setBusy("annulla");
    try {
      const result = await cancelLessonAsSchool(supabase, lesson.id, {
        memberId: actorMemberId,
        isStaff,
      });
      if (!result.success) {
        throw new Error(
          result.errorMessage ?? "Impossibile annullare la lezione.",
        );
      }
      logUsage("lezioni.lesson.cancelled_school", {
        properties: { lessonId: lesson.id, source: "oggi_da_segnare" },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <KindDot lesson={lesson} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">{name}</p>
          <p className="truncate text-xs tabular-nums text-neutral-500">{when}</p>
          {error ? (
            <p className="mt-0.5 text-xs text-red-700">{error}</p>
          ) : null}
        </div>

        {hold ? null : lesson.hasAttendance ? (
          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            OK
          </span>
        ) : canMark ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void markStatus("presente")}
              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === "presente" ? "…" : "Presente"}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void markStatus("assente")}
              className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "assente" ? "…" : "Assente"}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void cancelLesson()}
              className="rounded-md bg-neutral-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-neutral-600 disabled:opacity-50"
            >
              {busy === "annulla" ? "…" : "Annulla"}
            </button>
          </div>
        ) : onOpenLesson ? (
          <button
            type="button"
            onClick={() => onOpenLesson(lesson.id)}
            className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          >
            Presenza
          </button>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Presenza
          </span>
        )}

        {courseDetailBasePath ? (
          <Link
            href={`${courseDetailBasePath}/${lessonCourseId(lesson)}`}
            aria-label={`Apri corso di ${name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg font-medium text-[var(--brand)] hover:bg-neutral-50"
          >
            →
          </Link>
        ) : null}
      </div>
    </li>
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
