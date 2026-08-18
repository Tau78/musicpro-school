"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  assignCourseCoordinator,
  endCourseCoordinator,
  formatDateItalian,
  todayInRome,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

interface AssignCoordinatorFormProps {
  courseId: string;
  titularMemberId: string;
  actorMemberId: string;
  teachers: { id: string; label: string }[];
  current?: {
    memberId: string;
    firstName: string;
    lastName: string;
    startsOn: string;
  } | null;
}

export function AssignCoordinatorForm({
  courseId,
  titularMemberId,
  actorMemberId,
  teachers,
  current = null,
}: AssignCoordinatorFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const options = useMemo(
    () => teachers.filter((teacher) => teacher.id !== titularMemberId),
    [teachers, titularMemberId],
  );

  const [memberId, setMemberId] = useState(
    () =>
      options.find((teacher) => teacher.id !== current?.memberId)?.id ??
      options[0]?.id ??
      "",
  );
  const [startsOn, setStartsOn] = useState(todayInRome);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!memberId) {
      setError("Seleziona un docente.");
      return;
    }

    setBusy(true);
    const result = await assignCourseCoordinator(supabase, {
      courseId,
      coordinatorMemberId: memberId,
      startsOn,
      actorMemberId,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile assegnare il coordinatore.");
      return;
    }

    router.refresh();
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    const result = await endCourseCoordinator(supabase, {
      courseId,
      actorMemberId,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile togliere il coordinatore.");
      return;
    }

    router.refresh();
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
      <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
        Coordinatore
      </legend>
      <p className="text-sm text-neutral-500">
        Il titolare non vede questa assegnazione.
      </p>

      {current ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-neutral-800">
            Coordinatore: {current.lastName} {current.firstName} (dal{" "}
            {formatDateItalian(current.startsOn)})
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRemove()}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Togli
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {options.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nessun altro docente disponibile.
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-neutral-600">
              Docente
              <select
                value={memberId}
                disabled={busy}
                onChange={(e) => setMemberId(e.target.value)}
                className={inputClass}
                required
              >
                {options.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                    {teacher.id === current?.memberId ? " (attuale)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-neutral-600">
              Decorrenza
              <input
                type="date"
                value={startsOn}
                disabled={busy}
                onChange={(e) => setStartsOn(e.target.value)}
                className={inputClass}
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {busy ? "Assegno…" : "Assegna coordinatore"}
            </button>
          </div>
        </form>
      )}
    </fieldset>
  );
}
