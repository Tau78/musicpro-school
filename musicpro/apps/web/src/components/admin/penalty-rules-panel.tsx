"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type CancellationPenaltyRule,
  type CancellationPenaltyRuleInput,
  createCancellationPenaltyRule,
  deleteCancellationPenaltyRule,
  updateCancellationPenaltyRule,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface PenaltyRulesPanelProps {
  rules: CancellationPenaltyRule[];
}

function emptyRuleInput(sortOrder: number): CancellationPenaltyRuleInput {
  return {
    fromHours: 24,
    toHours: 12,
    penaltyPercent: 50,
    enabled: true,
    sortOrder,
  };
}

function ruleToInput(rule: CancellationPenaltyRule): CancellationPenaltyRuleInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = rule;
  return rest;
}

export function PenaltyRulesPanel({ rules }: PenaltyRulesPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CancellationPenaltyRuleInput>(
    emptyRuleInput(rules.length + 1),
  );
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof CancellationPenaltyRuleInput>(
    key: K,
    value: CancellationPenaltyRuleInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(rule: CancellationPenaltyRule) {
    setEditingId(rule.id);
    setForm(ruleToInput(rule));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyRuleInput(rules.length + 1));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = editingId
      ? await updateCancellationPenaltyRule(supabase, editingId, form)
      : await createCancellationPenaltyRule(supabase, form);

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess(editingId ? "Regola aggiornata." : "Regola creata.");
    setEditingId(null);
    setForm(emptyRuleInput(rules.length + 2));
    router.refresh();
  }

  async function handleDelete(ruleId: string) {
    setDeletingId(ruleId);
    setError(null);
    setSuccess(null);

    const result = await deleteCancellationPenaltyRule(supabase, ruleId);
    setDeletingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare la regola.");
      return;
    }

    if (editingId === ruleId) {
      cancelEdit();
    }

    setSuccess("Regola eliminata.");
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

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Fascia (ore prima)
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Penale
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Ordine
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Stato
              </th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rules.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neutral-500"
                >
                  Nessuna regola configurata.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-900">
                    Da {rule.fromHours}h a {rule.toHours}h
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {rule.penaltyPercent}%
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {rule.sortOrder}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        rule.enabled
                          ? "text-green-700"
                          : "text-neutral-400"
                      }
                    >
                      {rule.enabled ? "Attiva" : "Disattivata"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === rule.id}
                        onClick={() => void handleDelete(rule.id)}
                        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === rule.id ? "…" : "Elimina"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            {editingId ? "Modifica regola" : "Nuova regola penale"}
          </legend>
          <p className="text-sm text-neutral-600">
            Definisci una fascia oraria prima dell&apos;inizio evento. Il limite
            superiore (da ore) deve essere maggiore del limite inferiore (a ore).
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Da ore (limite superiore) *">
              <input
                type="number"
                min={0}
                step="0.5"
                required
                value={form.fromHours}
                onChange={(e) =>
                  updateField("fromHours", Number(e.target.value) || 0)
                }
                className={inputClass}
              />
            </Field>
            <Field label="A ore (limite inferiore) *">
              <input
                type="number"
                min={0}
                step="0.5"
                required
                value={form.toHours}
                onChange={(e) =>
                  updateField("toHours", Number(e.target.value) || 0)
                }
                className={inputClass}
              />
            </Field>
            <Field label="Penale (%) *">
              <input
                type="number"
                min={0}
                max={100}
                required
                value={form.penaltyPercent}
                onChange={(e) =>
                  updateField("penaltyPercent", Number(e.target.value) || 0)
                }
                className={inputClass}
              />
            </Field>
            <Field label="Ordine">
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  updateField("sortOrder", Number(e.target.value) || 0)
                }
                className={inputClass}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => updateField("enabled", e.target.checked)}
                className="rounded border-neutral-300"
              />
              Attiva
            </label>
          </div>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {saving
              ? "Salvataggio…"
              : editingId
                ? "Salva modifiche"
                : "Aggiungi regola"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-neutral-300 px-6 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Annulla modifica
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
