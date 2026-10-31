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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type MarkAction = "presente" | "assente" | "annulla";

type PendingState = {
  action: MarkAction;
  secondsLeft: number;
};

const UNDO_SECONDS = 5;

const ACTION_LABEL: Record<MarkAction, string> = {
  presente: "Presente",
  assente: "Assente",
  annulla: "Annullata",
};

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
  const supabase = useMemo(() => createClient(), []);
  const [visible, setVisible] = useState(rows);
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const committingRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // Sync dal server senza azzerare countdown / ripristinare righe già chiuse
  // (router.refresh crea un nuovo array `rows` a ogni round-trip).
  useEffect(() => {
    setVisible((current) => {
      const incoming = rows.filter(
        (row) => !dismissedRef.current.has(row.id),
      );
      const incomingIds = new Set(incoming.map((row) => row.id));
      const busyIds = new Set([
        ...Object.keys(pendingRef.current),
        ...committingRef.current,
      ]);
      const keptBusy = current.filter(
        (row) =>
          !incomingIds.has(row.id) &&
          busyIds.has(row.id) &&
          !dismissedRef.current.has(row.id),
      );
      return [...incoming, ...keptBusy];
    });
    setPending((current) => {
      if (Object.keys(current).length === 0) return current;
      const next: Record<string, PendingState> = {};
      for (const [id, state] of Object.entries(current)) {
        if (!dismissedRef.current.has(id)) next[id] = state;
      }
      return next;
    });
  }, [rows]);

  const dismissLesson = useCallback(
    (lessonId: string) => {
      dismissedRef.current.add(lessonId);
      setExiting((current) => ({ ...current, [lessonId]: true }));
      window.setTimeout(() => {
        setVisible((current) => current.filter((row) => row.id !== lessonId));
        setExiting((current) => {
          const next = { ...current };
          delete next[lessonId];
          return next;
        });
        onSaved();
      }, 280);
    },
    [onSaved],
  );

  const commitAction = useCallback(
    async (lessonId: string, action: MarkAction) => {
      if (!actorMemberId || committingRef.current.has(lessonId)) return;
      committingRef.current.add(lessonId);

      setPending((current) => {
        if (!(lessonId in current)) return current;
        const next = { ...current };
        delete next[lessonId];
        return next;
      });
      setErrors((current) => {
        if (!(lessonId in current)) return current;
        const next = { ...current };
        delete next[lessonId];
        return next;
      });

      try {
        if (action === "annulla") {
          const result = await cancelLessonAsSchool(supabase, lessonId, {
            memberId: actorMemberId,
            isStaff,
          });
          if (!result.success) {
            throw new Error(
              result.errorMessage ?? "Impossibile annullare la lezione.",
            );
          }
          logUsage("lezioni.lesson.cancelled_school", {
            properties: { lessonId, source: "oggi_da_segnare" },
          });
        } else {
          const status: AttendanceStatus = action;
          const roster = await getLessonRoster(supabase, lessonId, {
            memberId: actorMemberId,
            isStaff,
          });
          if (!roster) throw new Error("Lezione non trovata.");
          if (!roster.canEdit) {
            throw new Error(
              roster.editBlockReason ||
                "Non è possibile modificare le presenze.",
            );
          }
          if (roster.students.length === 0) {
            throw new Error("Nessun allievo in questa lezione.");
          }
          const result = await saveLessonAttendance(supabase, {
            lessonId,
            actorMemberId,
            isStaff,
            rows: roster.students.map((student) => ({
              memberId: student.memberId,
              status,
            })),
          });
          if (!result.success) {
            throw new Error(
              result.errorMessage ?? "Impossibile salvare le presenze.",
            );
          }
          logUsage("lezioni.attendance.saved", {
            properties: {
              lessonId,
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
        }

        dismissLesson(lessonId);
      } catch (err) {
        committingRef.current.delete(lessonId);
        setErrors((current) => ({
          ...current,
          [lessonId]:
            err instanceof Error ? err.message : "Operazione non riuscita.",
        }));
      }
    },
    [actorMemberId, dismissLesson, isStaff, supabase],
  );

  const hasPending = Object.keys(pending).length > 0;

  useEffect(() => {
    if (!hasPending) return;

    const timer = window.setInterval(() => {
      const snapshot = pendingRef.current;
      const due: { id: string; action: MarkAction }[] = [];
      const next: Record<string, PendingState> = {};

      for (const [id, state] of Object.entries(snapshot)) {
        if (state.secondsLeft <= 1) {
          due.push({ id, action: state.action });
          continue;
        }
        next[id] = { ...state, secondsLeft: state.secondsLeft - 1 };
      }

      setPending(next);
      for (const item of due) {
        void commitAction(item.id, item.action);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasPending, commitAction]);

  function startPending(lessonId: string, action: MarkAction) {
    setErrors((current) => {
      if (!(lessonId in current)) return current;
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
    setPending((current) => ({
      ...current,
      [lessonId]: { action, secondsLeft: UNDO_SECONDS },
    }));
  }

  function undoPending(lessonId: string) {
    setPending((current) => {
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
  }

  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {visible.map((lesson) => (
        <LessonOggiRow
          key={lesson.id}
          lesson={lesson}
          actorMemberId={actorMemberId}
          courseDetailBasePath={courseDetailBasePath}
          onOpenLesson={onOpenLesson}
          showDate={showDate}
          pending={pending[lesson.id] ?? null}
          exiting={Boolean(exiting[lesson.id])}
          error={errors[lesson.id] ?? null}
          onMark={(action) => startPending(lesson.id, action)}
          onUndo={() => undoPending(lesson.id)}
        />
      ))}
    </ul>
  );
}

function LessonOggiRow({
  lesson,
  actorMemberId,
  courseDetailBasePath,
  onOpenLesson,
  showDate,
  pending,
  exiting,
  error,
  onMark,
  onUndo,
}: {
  lesson: OggiLesson;
  actorMemberId?: string;
  courseDetailBasePath?: string;
  onOpenLesson?: (lessonId: string) => void;
  showDate: boolean;
  pending: PendingState | null;
  exiting: boolean;
  error: string | null;
  onMark: (action: MarkAction) => void;
  onUndo: () => void;
}) {
  const hold = isHoldLesson(lesson);
  const canMark = Boolean(actorMemberId) && !hold && !lesson.hasAttendance;
  const name = studentLabel(lesson);
  const when = whenLabel(lesson, showDate);
  const isPending = pending != null;

  return (
    <li
      className={`transition-all duration-300 ease-out ${
        exiting
          ? "max-h-0 overflow-hidden border-transparent opacity-0"
          : isPending
            ? "max-h-24 opacity-40"
            : "max-h-24 opacity-100"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <KindDot lesson={lesson} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">{name}</p>
          <p className="truncate text-xs tabular-nums text-neutral-500">
            {when}
            {pending ? (
              <>
                {" · "}
                <span className="font-medium text-neutral-800">
                  {ACTION_LABEL[pending.action]} · {pending.secondsLeft}s
                </span>
              </>
            ) : null}
          </p>
          {error ? (
            <p className="mt-0.5 text-xs text-red-700">{error}</p>
          ) : null}
        </div>

        {hold ? null : lesson.hasAttendance ? (
          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            OK
          </span>
        ) : isPending && pending ? (
          <button
            type="button"
            onClick={onUndo}
            className="shrink-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-800 hover:bg-neutral-50"
          >
            Ripristina
          </button>
        ) : canMark ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onMark("presente")}
              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              Presente
            </button>
            <button
              type="button"
              onClick={() => onMark("assente")}
              className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
            >
              Assente
            </button>
            <button
              type="button"
              onClick={() => onMark("annulla")}
              className="rounded-md bg-neutral-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-neutral-600"
            >
              Annulla
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
