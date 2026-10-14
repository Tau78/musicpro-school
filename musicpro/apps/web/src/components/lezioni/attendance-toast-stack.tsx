"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelLessonAsSchool,
  getLessonRoster,
  saveLessonAttendance,
  type AttendanceStatus,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";
import { logUsage } from "@/lib/usage-log";

export type AttendanceToastLesson = {
  id: string;
  studentLabel: string;
  whenLabel: string;
};

type ToastAction = "presente" | "assente" | "annullata";

type PendingState = {
  action: ToastAction;
  secondsLeft: number;
};

const COUNTDOWN_SECONDS = 10;

const ACTION_LABEL: Record<ToastAction, string> = {
  presente: "Presente",
  assente: "Assente",
  annullata: "Annullata",
};

export function AttendanceToastStack({
  lessons,
  actorMemberId,
}: {
  lessons: AttendanceToastLesson[];
  actorMemberId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [visible, setVisible] = useState(lessons);
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const committingRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    setVisible(lessons);
    setPending({});
    setExiting({});
    committingRef.current.clear();
  }, [lessons]);

  const dismissLesson = useCallback(
    (lessonId: string) => {
      setExiting((current) => ({ ...current, [lessonId]: true }));
      window.setTimeout(() => {
        setVisible((rows) => rows.filter((row) => row.id !== lessonId));
        setExiting((current) => {
          const next = { ...current };
          delete next[lessonId];
          return next;
        });
        router.refresh();
      }, 280);
    },
    [router],
  );

  const commitAction = useCallback(
    async (lessonId: string, action: ToastAction) => {
      if (committingRef.current.has(lessonId)) return;
      committingRef.current.add(lessonId);

      setPending((current) => {
        if (!(lessonId in current)) return current;
        const next = { ...current };
        delete next[lessonId];
        return next;
      });

      try {
        if (action === "annullata") {
          const result = await cancelLessonAsSchool(supabase, lessonId, {
            memberId: actorMemberId,
            isStaff: false,
          });
          if (!result.success) {
            throw new Error(
              result.errorMessage ?? "Impossibile annullare la lezione.",
            );
          }
          logUsage("lezioni.lesson.cancelled_school", {
            properties: { lessonId, source: "dashboard_toast" },
          });
        } else {
          const status: AttendanceStatus = action;
          const roster = await getLessonRoster(supabase, lessonId, {
            memberId: actorMemberId,
            isStaff: false,
          });
          if (!roster) {
            throw new Error("Lezione non trovata.");
          }
          if (!roster.canEdit) {
            throw new Error(
              roster.editBlockReason || "Non è possibile modificare le presenze.",
            );
          }
          if (roster.students.length === 0) {
            throw new Error("Nessun allievo in questa lezione.");
          }

          const result = await saveLessonAttendance(supabase, {
            lessonId,
            actorMemberId,
            isStaff: false,
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
              source: "dashboard_toast",
              status,
              students: roster.students.map((s) => s.memberId),
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
        setError(err instanceof Error ? err.message : "Operazione non riuscita.");
      }
    },
    [actorMemberId, dismissLesson, supabase],
  );

  const hasPending = Object.keys(pending).length > 0;

  useEffect(() => {
    if (!hasPending) return;

    const timer = window.setInterval(() => {
      const snapshot = pendingRef.current;
      const due: { id: string; action: ToastAction }[] = [];
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

  function startPending(lessonId: string, action: ToastAction) {
    setError(null);
    setPending((current) => ({
      ...current,
      [lessonId]: { action, secondsLeft: COUNTDOWN_SECONDS },
    }));
  }

  function undoPending(lessonId: string) {
    setPending((current) => {
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
  }

  if (visible.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Presenze da inserire">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
          Presenze da inserire
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
            {visible.length}
          </span>
        </h2>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {visible.map((lesson) => {
          const pendingState = pending[lesson.id];
          const isPending = Boolean(pendingState);
          const isExiting = Boolean(exiting[lesson.id]);

          return (
            <li
              key={lesson.id}
              className={`overflow-hidden rounded-xl border border-white/70 bg-white/90 shadow-sm transition-all duration-300 ease-out ${
                isExiting
                  ? "max-h-0 -translate-y-1 border-transparent opacity-0 shadow-none"
                  : "max-h-28 opacity-100"
              } ${isPending && !isExiting ? "opacity-50" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {lesson.studentLabel}
                  </p>
                  <p className="truncate text-xs text-neutral-600">
                    {lesson.whenLabel}
                    {pendingState ? (
                      <>
                        {" · "}
                        <span className="font-medium text-neutral-800">
                          {ACTION_LABEL[pendingState.action]} ·{" "}
                          {pendingState.secondsLeft}s
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>

                {isPending && pendingState ? (
                  <button
                    type="button"
                    onClick={() => undoPending(lesson.id)}
                    className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  >
                    Annulla
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <ActionButton
                      tone="assente"
                      label="Assente"
                      onClick={() => startPending(lesson.id, "assente")}
                    />
                    <ActionButton
                      tone="annullata"
                      label="Annullata"
                      onClick={() => startPending(lesson.id, "annullata")}
                    />
                    <ActionButton
                      tone="presente"
                      label="Presente"
                      onClick={() => startPending(lesson.id, "presente")}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActionButton({
  tone,
  label,
  onClick,
}: {
  tone: ToastAction;
  label: string;
  onClick: () => void;
}) {
  const classes =
    tone === "assente"
      ? "bg-red-600 text-white hover:bg-red-700"
      : tone === "annullata"
        ? "bg-neutral-500 text-white hover:bg-neutral-600"
        : "bg-emerald-600 text-white hover:bg-emerald-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${classes}`}
    >
      {label}
    </button>
  );
}
