"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createSchoolClosure,
  deleteSchoolClosure,
  formatDateItalian,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

export type SchoolClosureFormRow = {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string;
  repeatsYearly: boolean;
};

interface SchoolClosuresFormProps {
  closures: SchoolClosureFormRow[];
}

export function SchoolClosuresForm({ closures }: SchoolClosuresFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [repeatsYearly, setRepeatsYearly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await createSchoolClosure(supabase, {
      title,
      startsOn,
      endsOn,
      repeatsYearly,
    });

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare la festività.");
      return;
    }

    setSuccess("Festività aggiunta.");
    setTitle("");
    setStartsOn("");
    setEndsOn("");
    setRepeatsYearly(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Eliminare questa festività?")) return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);

    const result = await deleteSchoolClosure(supabase, id);
    setDeletingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare la festività.");
      return;
    }

    setSuccess("Festività eliminata.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
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

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Festività
        </legend>
        {closures.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessuna festività.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {closures.map((closure) => (
              <li
                key={closure.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-neutral-900">{closure.title}</p>
                  <p className="text-neutral-500">
                    {formatDateItalian(closure.startsOn)} –{" "}
                    {formatDateItalian(closure.endsOn)}
                    {closure.repeatsYearly ? " · ogni anno" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(closure.id)}
                  disabled={deletingId === closure.id}
                  className="text-sm text-red-700 hover:underline disabled:opacity-50"
                >
                  {deletingId === closure.id ? "Eliminazione…" : "Elimina"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Nuova festività
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-neutral-600">Titolo *</span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="es. Natale"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Dal *</span>
              <input
                type="date"
                required
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Al *</span>
              <input
                type="date"
                required
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={repeatsYearly}
              onChange={(e) => setRepeatsYearly(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Si ripete ogni anno
          </label>
        </fieldset>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Aggiungi festività"}
        </button>
      </form>
    </div>
  );
}
