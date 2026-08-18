"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  closeCourse,
  formatDateItalian,
  formatEuro,
  getCourseAccountingSummary,
  listUndoableLifecycleEvents,
  pauseCourse,
  removeCourseEnrollment,
  requestCourseClose,
  resumeCourse,
  todayInRome,
  undoCourseLifecycle,
  type CourseDetail,
  type CourseLifecycleEvent,
  type CourseMutationResult,
  type LifecycleAccountingRow,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

function studentName(row: { firstName: string; lastName: string }): string {
  return `${row.lastName} ${row.firstName}`.trim() || "Allievo";
}

function formatCredits(value: number): string {
  const abs = Math.abs(value);
  const noun = abs === 1 ? "lezione" : "lezioni";
  if (value < 0) return `debito ${abs} ${noun}`;
  return `${value} ${noun}`;
}

function accountingLine(row: LifecycleAccountingRow): string {
  const fees =
    row.openFeeCount > 0
      ? `${row.openFeeCount} ${row.openFeeCount === 1 ? "retta aperta" : "rette aperte"} (${formatEuro(row.openFeesEur)})`
      : "nessuna retta aperta";
  const leftover =
    row.leftoverEurFamily > 0
      ? `, residuo famiglia ${formatEuro(row.leftoverEurFamily)}`
      : "";
  return `${row.studentLabel}: wallet ${formatCredits(row.creditBalance)}, ${fees}${leftover}`;
}

function undoKindLabel(kind: CourseLifecycleEvent["kind"]): string {
  if (kind === "pause") return "Pausa";
  if (kind === "close") return "Chiusura";
  if (kind === "remove_enrollment") return "Rimozione iscritto";
  return "Azione";
}

export function CourseLifecycleActions(props: {
  course: CourseDetail;
  actorMemberId: string;
  isStaff: boolean;
  canCloseCourses: boolean;
}): JSX.Element | null {
  const { course, actorMemberId, isStaff, canCloseCourses } = props;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const actor = useMemo(
    () => ({ memberId: actorMemberId, isStaff, canCloseCourses }),
    [actorMemberId, isStaff, canCloseCourses],
  );

  const canMutate = isStaff || canCloseCourses;
  const isOpen = course.status === "attivo" || course.status === "in_pausa";
  const showPause = canMutate && course.status === "attivo";
  const showResume = canMutate && course.status === "in_pausa";
  const showClose =
    canMutate &&
    isOpen &&
    (course.courseKind === "individuale" || course.courseKind === "online");
  const activeEnrollments = course.enrollments.filter((row) => !row.leftAt);
  const showRemove =
    canMutate &&
    isOpen &&
    course.courseKind === "gruppo" &&
    activeEnrollments.length > 0;
  const showRequest = !canMutate && isOpen;

  const [closedOn, setClosedOn] = useState(todayInRome);
  const [requestNote, setRequestNote] = useState("");
  const [undoEvents, setUndoEvents] = useState<CourseLifecycleEvent[] | null>(
    canMutate ? null : [],
  );
  const [accounting, setAccounting] = useState<LifecycleAccountingRow[] | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUndo = useCallback(async () => {
    if (!canMutate) {
      setUndoEvents([]);
      return;
    }
    try {
      const events = await listUndoableLifecycleEvents(supabase, course.id);
      setUndoEvents(events);
    } catch {
      setUndoEvents([]);
    }
  }, [canMutate, course.id, supabase]);

  useEffect(() => {
    void loadUndo();
  }, [loadUndo, course.status]);

  const showUndo = canMutate && (undoEvents?.length ?? 0) > 0;
  const loadingUndo = canMutate && undoEvents === null;
  const hasActions =
    showPause || showResume || showClose || showRemove || showRequest || showUndo;

  if (course.isTrial) return null;
  if (!hasActions && !loadingUndo) return null;

  async function loadAccounting(
    enrollmentId?: string,
  ): Promise<LifecycleAccountingRow[] | null> {
    try {
      const rows = await getCourseAccountingSummary(
        supabase,
        course.id,
        enrollmentId ? { enrollmentId } : undefined,
      );
      setAccounting(rows);
      return rows;
    } catch {
      return null;
    }
  }

  function applyResult(result: CourseMutationResult, fallback: string) {
    if (!result.success) {
      setError(result.errorMessage ?? fallback);
      return false;
    }
    if (result.warnings?.length) {
      setNotice(result.warnings.join(" "));
    }
    router.refresh();
    void loadUndo();
    return true;
  }

  async function handlePause() {
    if (
      !window.confirm(
        "Mettere in pausa questo corso? Le lezioni future vengono cancellate e le sale si liberano.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("pause");
    const result = await pauseCourse(supabase, { courseId: course.id, actor });
    setBusy(null);
    applyResult(result, "Impossibile mettere in pausa il corso.");
  }

  async function handleResume() {
    if (
      !window.confirm(
        "Riprendere questo corso? Le lezioni si rigenerano dove le sale sono libere.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("resume");
    const result = await resumeCourse(supabase, { courseId: course.id, actor });
    setBusy(null);
    applyResult(result, "Impossibile riprendere il corso.");
  }

  async function handleClose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closedOn) {
      setError("La data di chiusura è obbligatoria.");
      return;
    }
    setError(null);
    setNotice(null);
    const summary = await loadAccounting();
    const lines = summary?.map(accountingLine).join("\n");
    const confirmText = [
      `Chiudere il corso in data ${formatDateItalian(closedOn)}? Le lezioni dopo quella data verranno cancellate.`,
      lines ? `\nSituazione contabile:\n${lines}` : "",
    ].join("");
    if (!window.confirm(confirmText)) return;

    setBusy("close");
    const result = await closeCourse(supabase, {
      courseId: course.id,
      closedOn,
      actor,
    });
    setBusy(null);
    applyResult(result, "Impossibile chiudere il corso.");
  }

  async function handleRemove(enrollmentId: string, label: string) {
    setError(null);
    setNotice(null);
    const summary = await loadAccounting(enrollmentId);
    const lines = summary?.map(accountingLine).join("\n");
    const confirmText = [
      `Rimuovere ${label} dal corso? Le lezioni di gruppo restano.`,
      lines ? `\nSituazione contabile:\n${lines}` : "",
    ].join("");
    if (!window.confirm(confirmText)) return;

    setBusy(`remove:${enrollmentId}`);
    const result = await removeCourseEnrollment(supabase, {
      enrollmentId,
      actor,
    });
    setBusy(null);
    applyResult(result, "Impossibile rimuovere l’iscritto.");
  }

  async function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("request");
    const result = await requestCourseClose(supabase, {
      courseId: course.id,
      actor,
      note: requestNote.trim() || undefined,
    });
    setBusy(null);
    if (applyResult(result, "Impossibile inviare la richiesta.")) {
      setRequestNote("");
    }
  }

  async function handleUndo(eventId: string) {
    if (
      !window.confirm(
        "Annullare questa azione? Funziona solo se le sale sono ancora libere.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(`undo:${eventId}`);
    const result = await undoCourseLifecycle(supabase, { eventId, actor });
    setBusy(null);
    applyResult(result, "Impossibile annullare l’azione.");
  }

  return (
    <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
        Ciclo vita
      </legend>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      ) : null}

      {undoEvents?.map((event) => (
        <div
          key={event.id}
          className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
        >
          <p className="font-medium">{undoKindLabel(event.kind)}</p>
          <p>Puoi annullare entro 24 ore se le sale sono ancora libere.</p>
          {event.payload.studentLabel ? (
            <p className="text-amber-800">{event.payload.studentLabel}</p>
          ) : null}
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void handleUndo(event.id)}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {busy === `undo:${event.id}` ? "Annullamento…" : "Annulla (24h)"}
          </button>
        </div>
      ))}

      {showPause ? (
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void handlePause()}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy === "pause" ? "Pausa…" : "Metti in pausa"}
        </button>
      ) : null}

      {showResume ? (
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void handleResume()}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy === "resume" ? "Ripresa…" : "Riprendi corso"}
        </button>
      ) : null}

      {showClose ? (
        <form onSubmit={(event) => void handleClose(event)} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Data chiusura</span>
            <input
              required
              type="date"
              value={closedOn}
              disabled={busy != null}
              onChange={(e) => setClosedOn(e.target.value)}
              className={inputClass}
            />
          </label>
          {accounting ? (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {accounting.length === 0 ? (
                <li>Nessun iscritto attivo o rette aperte.</li>
              ) : (
                accounting.map((row) => (
                  <li key={row.enrollmentId}>{accountingLine(row)}</li>
                ))
              )}
            </ul>
          ) : null}
          <button
            type="submit"
            disabled={busy != null}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {busy === "close" ? "Chiusura…" : "Chiudi corso"}
          </button>
        </form>
      ) : null}

      {showRemove ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Rimuovi iscritto
          </p>
          {accounting ? (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {accounting.length === 0 ? (
                <li>Nessun iscritto attivo o rette aperte.</li>
              ) : (
                accounting.map((row) => (
                  <li key={row.enrollmentId}>{accountingLine(row)}</li>
                ))
              )}
            </ul>
          ) : null}
          <ul className="space-y-2">
            {activeEnrollments.map((enrollment) => {
              const label = studentName(enrollment);
              return (
                <li
                  key={enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-sm text-neutral-800">{label}</span>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void handleRemove(enrollment.id, label)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busy === `remove:${enrollment.id}`
                      ? "Rimozione…"
                      : "Rimuovi iscritto"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {showRequest ? (
        <form
          onSubmit={(event) => void handleRequest(event)}
          className="space-y-3"
        >
          <p className="text-sm text-neutral-600">
            La segreteria riceverà una email e vedrà la richiesta in Coda.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Nota</span>
            <textarea
              value={requestNote}
              disabled={busy != null}
              onChange={(e) => setRequestNote(e.target.value)}
              rows={3}
              placeholder="Opzionale"
              className={`w-full ${inputClass}`}
            />
          </label>
          <button
            type="submit"
            disabled={busy != null}
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {busy === "request" ? "Invio…" : "Richiedi chiusura"}
          </button>
        </form>
      ) : null}
    </fieldset>
  );
}
