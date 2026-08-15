"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type BookingSettings,
  type BookingSettingsInput,
  updateBookingSettings,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface BookingSettingsFormProps {
  settings: BookingSettings;
}

function settingsToInput(settings: BookingSettings): BookingSettingsInput {
  return {
    autoConfirmMinHours: settings.autoConfirmMinHours,
    approvalMinHours: settings.approvalMinHours,
    cancelMinHours: settings.cancelMinHours,
    modifyMinHours: settings.modifyMinHours,
  };
}

export function BookingSettingsForm({ settings }: BookingSettingsFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<BookingSettingsInput>(
    settingsToInput(settings),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof BookingSettingsInput>(
    key: K,
    value: BookingSettingsInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await updateBookingSettings(supabase, form);
    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess("Impostazioni aggiornate.");
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
          Soglie prenotazione
        </legend>
        <p className="text-sm text-neutral-600">
          Le soglie definiscono il comportamento delle prenotazioni associate in
          base all&apos;anticipo rispetto all&apos;inizio dell&apos;evento.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conferma automatica (ore minime) *">
            <input
              type="number"
              min={1}
              required
              value={form.autoConfirmMinHours}
              onChange={(e) =>
                updateField(
                  "autoConfirmMinHours",
                  Number(e.target.value) || 0,
                )
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              ≥ queste ore: prenotazione in attesa pagamento (default 12h).
            </span>
          </Field>
          <Field label="Approvazione admin (ore minime) *">
            <input
              type="number"
              min={1}
              required
              value={form.approvalMinHours}
              onChange={(e) =>
                updateField("approvalMinHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Tra questa soglia e la conferma automatica: richiede approvazione
              (default 6h).
            </span>
          </Field>
          <Field label="Annullamento self-service (ore minime) *">
            <input
              type="number"
              min={1}
              required
              value={form.cancelMinHours}
              onChange={(e) =>
                updateField("cancelMinHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              L&apos;associato può annullare solo se mancano almeno queste ore
              (default 24h).
            </span>
          </Field>
          <Field label="Modifica self-service (ore minime) *">
            <input
              type="number"
              min={1}
              required
              value={form.modifyMinHours}
              onChange={(e) =>
                updateField("modifyMinHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Sotto questa soglia solo l&apos;admin può modificare la prenotazione
              (default 6h).
            </span>
          </Field>
        </div>
      </fieldset>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva impostazioni"}
        </button>
      </div>
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
