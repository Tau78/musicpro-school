"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { transferCourseTitular } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

interface TransferTitularFormProps {
  courseId: string;
  currentTitularId: string;
  actorMemberId: string;
  teachers: { id: string; label: string }[];
}

export function TransferTitularForm({
  courseId,
  currentTitularId,
  actorMemberId,
  teachers,
}: TransferTitularFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const options = useMemo(
    () => teachers.filter((teacher) => teacher.id !== currentTitularId),
    [teachers, currentTitularId],
  );

  const [memberId, setMemberId] = useState(options[0]?.id ?? "");
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
    const result = await transferCourseTitular(supabase, courseId, memberId, {
      memberId: actorMemberId,
      isStaff: true,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile cambiare il titolare.");
      return;
    }

    router.refresh();
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nessun altro docente disponibile.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-neutral-600">
          Nuovo titolare
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
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy ? "Passo…" : "Passa titolare"}
        </button>
      </div>
    </form>
  );
}
