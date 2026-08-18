"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelLessonAsSchool,
  getLessonRoster,
  saveLessonAttendance,
  unlockLessonAttendance,
  type AttendanceStatus,
  type LessonRoster,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export interface LessonAttendancePanelProps {
  lessonId: string;
  actorMemberId: string;
  isStaff: boolean;
  onSaved?: () => void;
}

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "presente", label: "Presente" },
  { value: "assente", label: "Assente" },
  { value: "assente_giustificato", label: "Giustificato" },
];

function isHoldLessonId(lessonId: string): boolean {
  return lessonId.startsWith("hold:");
}

function studentLabel(firstName: string, lastName: string): string {
  return `${lastName} ${firstName}`.trim() || "Allievo";
}

function draftFromRoster(
  roster: LessonRoster,
): Record<string, AttendanceStatus> {
  return Object.fromEntries(
    roster.students.map((student) => [
      student.memberId,
      student.status ?? "presente",
    ]),
  );
}

export function LessonAttendancePanel({
  lessonId,
  actorMemberId,
  isStaff,
  onSaved,
}: LessonAttendancePanelProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [roster, setRoster] = useState<LessonRoster | null>(null);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(!isHoldLessonId(lessonId));
  const [busy, setBusy] = useState<"save" | "cancel" | "unlock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const actor = useMemo(
    () => ({ memberId: actorMemberId, isStaff }),
    [actorMemberId, isStaff],
  );

  const loadRoster = useCallback(async () => {
    if (isHoldLessonId(lessonId)) {
      setRoster(null);
      setDraft({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await getLessonRoster(supabase, lessonId, actor);
      setRoster(next);
      setDraft(next ? draftFromRoster(next) : {});
    } catch (err) {
      setRoster(null);
      setDraft({});
      setError(
        err instanceof Error ? err.message : "Impossibile caricare il registro.",
      );
    } finally {
      setLoading(false);
    }
  }, [actor, lessonId, supabase]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const needsInsert = Boolean(
    roster?.students.some((student) => student.status === null),
  );
  const canUnlock = Boolean(
    isStaff && roster?.students.some((student) => student.status != null),
  );
  const firstPhone =
    roster?.students.find((student) => student.phone)?.phone ??
    roster?.students.find((student) => student.tutorPhone)?.tutorPhone ??
    null;

  async function handleSave() {
    if (!roster || !roster.canEdit) return;

    setBusy("save");
    setError(null);
    setSuccess(null);

    const result = await saveLessonAttendance(supabase, {
      lessonId,
      actorMemberId,
      isStaff,
      rows: roster.students.map((student) => ({
        memberId: student.memberId,
        status: draft[student.memberId] ?? "presente",
      })),
    });

    setBusy(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare le presenze.");
      return;
    }

    setSuccess("Presenze salvate.");
    await loadRoster();
    onSaved?.();
    router.refresh();
  }

  async function handleCancelAsSchool() {
    if (!roster?.canEdit) return;
    if (
      !window.confirm(
        "Cancellare questa lezione come scuola? La sala si libera e la lezione va in da recuperare.",
      )
    ) {
      return;
    }

    setBusy("cancel");
    setError(null);
    setSuccess(null);

    const result = await cancelLessonAsSchool(supabase, lessonId, actor);
    setBusy(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile cancellare la lezione.");
      return;
    }

    setSuccess("Lezione cancellata.");
    onSaved?.();
    router.refresh();
  }

  async function handleUnlock() {
    if (!canUnlock) return;
    if (
      !window.confirm(
        "Le presenze si cancellano. Il credito pack resta. Poi puoi spostare la lezione.",
      )
    ) {
      return;
    }

    setBusy("unlock");
    setError(null);
    setSuccess(null);

    const result = await unlockLessonAttendance(supabase, lessonId, {
      memberId: actorMemberId,
      isStaff,
    });
    setBusy(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile sbloccare le presenze.");
      return;
    }

    setSuccess("Presenze sbloccate.");
    await loadRoster();
    onSaved?.();
    router.refresh();
  }

  if (isHoldLessonId(lessonId)) {
    return (
      <p className="text-sm text-neutral-500">
        Corso in attesa, niente registro.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Carico il registro…</p>;
  }

  if (!roster) {
    return (
      <p className="text-sm text-neutral-500">Registro non disponibile.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {needsInsert ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Da inserire
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            OK
          </span>
        )}
        {firstPhone ? (
          <a
            href={`tel:${firstPhone}`}
            className="text-sm text-[var(--brand)] hover:underline"
          >
            {firstPhone}
          </a>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      {isStaff && roster.payrollClosed ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Mese chiuso. Sblocca la notula per ricalcolare i compensi.
        </p>
      ) : null}

      {!roster.canEdit && roster.editBlockReason ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {roster.editBlockReason}
        </p>
      ) : null}

      {roster.students.length === 0 ? (
        <p className="text-sm text-neutral-500">Nessun allievo in elenco.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {roster.students.map((student) => {
            const selected = draft[student.memberId] ?? "presente";
            return (
              <li key={student.memberId} className="space-y-2 px-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">
                    {studentLabel(student.firstName, student.lastName)}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {student.phone ? (
                      <a
                        href={`tel:${student.phone}`}
                        className="text-[var(--brand)] hover:underline"
                      >
                        {student.phone}
                      </a>
                    ) : (
                      "Nessun telefono"
                    )}
                    {student.tutorPhone ? (
                      <>
                        <span className="text-neutral-300"> · </span>
                        Tutore{" "}
                        <a
                          href={`tel:${student.tutorPhone}`}
                          className="text-[var(--brand)] hover:underline"
                        >
                          {student.tutorPhone}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label={`Presenza di ${studentLabel(student.firstName, student.lastName)}`}
                  className="flex flex-wrap gap-1"
                >
                  {STATUSES.map((status) => {
                    const active = selected === status.value;
                    return (
                      <button
                        key={status.value}
                        type="button"
                        disabled={!roster.canEdit || busy != null}
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            [student.memberId]: status.value,
                          }))
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                          active
                            ? "bg-[var(--brand)] text-white"
                            : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        {status.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!roster.canEdit || busy != null || roster.students.length === 0}
          onClick={() => void handleSave()}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy === "save" ? "Salvo…" : "Salva presenze"}
        </button>
        <button
          type="button"
          disabled={!roster.canEdit || busy != null}
          onClick={() => void handleCancelAsSchool()}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === "cancel"
            ? "Cancello…"
            : "Lezione cancellata (scuola)"}
        </button>
        {canUnlock ? (
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void handleUnlock()}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {busy === "unlock" ? "Sblocco…" : "Sblocca presenza"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
