"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { markTeacherAbsent, todayInRome } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export interface TeacherAbsentActionsProps {
  actorMemberId: string;
  isStaff: boolean;
  teacherId?: string;
  teachers?: { id: string; label: string }[];
}

const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

export function TeacherAbsentActions({
  actorMemberId,
  isStaff,
  teacherId,
  teachers,
}: TeacherAbsentActionsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayInRome();

  const [selectedTeacherId, setSelectedTeacherId] = useState(
    teacherId ?? (isStaff ? (teachers?.[0]?.id ?? "") : actorMemberId),
  );
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const titularMemberId = isStaff
    ? selectedTeacherId || teacherId || ""
    : actorMemberId;
  const showTeacherSelect = isStaff && (teachers?.length ?? 0) > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!titularMemberId) {
      setError("Seleziona un docente.");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Dal e al sono obbligatori.");
      return;
    }
    if (toDate < fromDate) {
      setError("La data di fine deve essere successiva o uguale all'inizio.");
      return;
    }
    if (
      !window.confirm(
        "Segnare il docente assente in questo periodo? Le lezioni vanno in da recuperare e le sale si liberano.",
      )
    ) {
      return;
    }

    setBusy(true);
    const result = await markTeacherAbsent(supabase, {
      titularMemberId,
      fromDate,
      toDate,
      actorMemberId,
      isStaff,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile registrare l'assenza.");
      return;
    }

    const extra =
      result.warnings && result.warnings.length > 0
        ? ` ${result.warnings.join(" ")}`
        : "";
    setSuccess(`Assenza registrata.${extra}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--brand)]">
          Docente assente
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          Segna un&apos;assenza oggi o in un periodo. Le lezioni vanno in da
          recuperare e la sala si libera.
        </p>
      </div>

      {isStaff && (teachers?.length ?? 0) === 0 && !teacherId ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Nessun docente in rubrica.
        </p>
      ) : null}

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

      <div className="flex flex-wrap items-end gap-3">
        {showTeacherSelect ? (
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-neutral-600">
            Docente
            <select
              value={titularMemberId}
              disabled={busy}
              onChange={(event) => setSelectedTeacherId(event.target.value)}
              className={inputClass}
              required
            >
              {teachers!.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Dal
          <input
            type="date"
            value={fromDate}
            disabled={busy}
            onChange={(event) => setFromDate(event.target.value)}
            className={inputClass}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Al
          <input
            type="date"
            value={toDate}
            disabled={busy}
            onChange={(event) => setToDate(event.target.value)}
            className={inputClass}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy || !titularMemberId}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy ? "Segno…" : "Docente assente"}
        </button>
      </div>
    </form>
  );
}
