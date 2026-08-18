"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  formatDateItalian,
  upsertSchoolCourseTerm,
} from "@musicpro/database";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { createClient } from "@/lib/supabase/client";

export type CourseTermSummary = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
};

interface CourseTermFormProps {
  currentTerm: CourseTermSummary | null;
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

export function CourseTermForm({ currentTerm }: CourseTermFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [isCurrent, setIsCurrent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await upsertSchoolCourseTerm(supabase, {
      label,
      startsOn,
      endsOn,
      isCurrent,
    });

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare l'anno corsi.");
      return;
    }

    setSuccess("Anno corsi salvato.");
    setLabel("");
    setStartsOn("");
    setEndsOn("");
    setIsCurrent(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {currentTerm ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Anno corsi corrente: <strong>{currentTerm.label}</strong> (
          {formatDateItalian(currentTerm.startsOn)} –{" "}
          {formatDateItalian(currentTerm.endsOn)})
        </p>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nessun anno corsi corrente. Impostalo prima di creare i corsi.
        </p>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <CollapsibleSection title="Anno corsi" defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *" className="sm:col-span-2">
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="es. 2026/2027"
              className={inputClass}
            />
          </Field>
          <Field label="Inizio *">
            <input
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Fine *">
            <input
              type="date"
              required
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isCurrent}
            onChange={(e) => setIsCurrent(e.target.checked)}
            className="rounded border-neutral-300"
          />
          Imposta come anno corrente
        </label>
      </CollapsibleSection>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva anno corsi"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
