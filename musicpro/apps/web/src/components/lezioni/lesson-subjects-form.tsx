"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createLessonSubject,
  renameLessonSubject,
  setLessonSubjectActive,
} from "@musicpro/database";

import { FieldLabel, settingsInputClass } from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

export type LessonSubjectFormRow = {
  id: string;
  name: string;
  isActive: boolean;
};

export function LessonSubjectsForm({
  subjects,
}: {
  subjects: LessonSubjectFormRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(subjects.map((row) => [row.id, row.name])),
  );
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await createLessonSubject(supabase, name);
    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare la materia.");
      return;
    }

    setSuccess("Materia aggiunta.");
    setName("");
    router.refresh();
  }

  async function handleRename(id: string) {
    const next = (drafts[id] ?? "").trim();
    setBusyId(id);
    setError(null);
    setSuccess(null);

    const result = await renameLessonSubject(supabase, id, next);
    setBusyId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile rinominare la materia.");
      return;
    }

    setSuccess("Materia rinominata.");
    router.refresh();
  }

  async function handleToggle(id: string, isActive: boolean) {
    setBusyId(id);
    setError(null);
    setSuccess(null);

    const result = await setLessonSubjectActive(supabase, id, isActive);
    setBusyId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile aggiornare la materia.");
      return;
    }

    setSuccess(isActive ? "Materia riattivata." : "Materia disattivata.");
    router.refresh();
  }

  return (
    <div className="space-y-8">
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

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-[var(--brand)]">Materie</h3>
        <p className="text-sm text-neutral-600">
          Disattivare è soft: i corsi esistenti restano, la materia non si
          assegna più ai nuovi.
        </p>
        {subjects.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessuna materia.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {subjects.map((subject) => {
              const draft = drafts[subject.id] ?? subject.name;
              const renamed = draft.trim() !== subject.name;
              return (
                <li
                  key={subject.id}
                  className="flex flex-wrap items-center gap-2 px-4 py-3"
                >
                  <input
                    value={draft}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [subject.id]: e.target.value,
                      }))
                    }
                    className={`${settingsInputClass} min-w-[12rem] flex-1 ${
                      subject.isActive ? "" : "text-neutral-500"
                    }`}
                  />
                  {subject.isActive ? null : (
                    <span className="text-xs text-neutral-500">Disattivata</span>
                  )}
                  <button
                    type="button"
                    disabled={busyId === subject.id || !renamed}
                    onClick={() => handleRename(subject.id)}
                    className="text-sm text-[var(--brand)] hover:underline disabled:opacity-40"
                  >
                    Rinomina
                  </button>
                  <button
                    type="button"
                    disabled={busyId === subject.id}
                    onClick={() =>
                      handleToggle(subject.id, !subject.isActive)
                    }
                    className="text-sm text-neutral-700 hover:underline disabled:opacity-40"
                  >
                    {subject.isActive ? "Disattiva" : "Riattiva"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form onSubmit={handleCreate} className="space-y-4">
        <h3 className="text-base font-semibold text-[var(--brand)]">
          Nuova materia
        </h3>
        <label className="block">
          <FieldLabel>Nome</FieldLabel>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. Ukulele"
            className={settingsInputClass}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Aggiungi materia"}
        </button>
      </form>
    </div>
  );
}
