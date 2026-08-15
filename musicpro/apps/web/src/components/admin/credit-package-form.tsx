"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type CreditPackage,
  type CreditPackageInput,
  createCreditPackage,
  deleteCreditPackage,
  updateCreditPackage,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface CreditPackageFormProps {
  creditPackage?: CreditPackage;
  canDelete?: boolean;
}

function emptyCreditPackageInput(): CreditPackageInput {
  return {
    name: "",
    credits: 10,
    priceEur: 0,
    description: null,
    enabled: true,
    sortOrder: 0,
  };
}

function creditPackageToInput(
  creditPackage: CreditPackage,
): CreditPackageInput {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = creditPackage;
  return rest;
}

export function CreditPackageForm({
  creditPackage,
  canDelete = false,
}: CreditPackageFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = Boolean(creditPackage);

  const [form, setForm] = useState<CreditPackageInput>(
    creditPackage
      ? creditPackageToInput(creditPackage)
      : emptyCreditPackageInput(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof CreditPackageInput>(
    key: K,
    value: CreditPackageInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Il nome è obbligatorio.");
      setSaving(false);
      return;
    }

    if (form.credits <= 0) {
      setError("I crediti devono essere maggiori di zero.");
      setSaving(false);
      return;
    }

    if (form.priceEur < 0) {
      setError("Il prezzo non può essere negativo.");
      setSaving(false);
      return;
    }

    const result = isEdit
      ? await updateCreditPackage(supabase, creditPackage!.id, form)
      : await createCreditPackage(supabase, form);

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess(isEdit ? "Pacchetto aggiornato." : "Pacchetto creato.");

    if (!isEdit && result.id) {
      router.push(`/admin/shop/${result.id}`);
      router.refresh();
    } else {
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!creditPackage) return;

    setDeleting(true);
    setError(null);

    const result = await deleteCreditPackage(supabase, creditPackage.id);
    setDeleting(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare il pacchetto.");
      setShowDeleteConfirm(false);
      return;
    }

    router.push("/admin/shop");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Pacchetto crediti
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *" className="sm:col-span-2">
            <input
              required
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Crediti *">
            <input
              type="number"
              min={1}
              required
              value={form.credits}
              onChange={(e) =>
                updateField("credits", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Prezzo (EUR) *">
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.priceEur}
              onChange={(e) =>
                updateField("priceEur", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Ordine visualizzazione">
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                updateField("sortOrder", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Descrizione" className="sm:col-span-2">
            <textarea
              rows={3}
              value={form.description ?? ""}
              onChange={(e) =>
                updateField("description", e.target.value || null)
              }
              className={inputClass}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => updateField("enabled", e.target.checked)}
              className="rounded border-neutral-300"
            />
            Pacchetto attivo nello shop
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {saving
              ? "Salvataggio…"
              : isEdit
                ? "Salva modifiche"
                : "Crea pacchetto"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/shop")}
            className="rounded-lg border border-neutral-300 px-6 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Annulla
          </button>
        </div>

        {isEdit && canDelete ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-300 px-6 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Elimina
          </button>
        ) : null}
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-neutral-900">
              Conferma eliminazione
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Eliminare definitivamente{" "}
              <strong>{creditPackage?.name}</strong>? Questa azione non può
              essere annullata.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Eliminazione…" : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

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
