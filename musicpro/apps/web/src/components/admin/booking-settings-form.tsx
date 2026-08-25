"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type BookingSettings,
  type BookingSettingsInput,
  updateBookingSettings,
} from "@musicpro/database";

import {
  FieldLabel,
  SettingsTabs,
  ToggleRow,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

interface BookingSettingsFormProps {
  settings: BookingSettings;
}

type BookingTab = "soglie" | "band" | "blocco";

function settingsToInput(settings: BookingSettings): BookingSettingsInput {
  return {
    autoConfirmMinHours: settings.autoConfirmMinHours,
    approvalMinHours: settings.approvalMinHours,
    cancelMinHours: settings.cancelMinHours,
    modifyMinHours: settings.modifyMinHours,
    bandRequired: settings.bandRequired,
    locked: settings.locked,
    lockedMessage: settings.lockedMessage,
  };
}

export function BookingSettingsForm({ settings }: BookingSettingsFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<BookingTab>("soglie");
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
    <form onSubmit={handleSubmit} className="space-y-6">
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

      <SettingsTabs
        tabs={[
          { id: "soglie", label: "Soglie" },
          { id: "band", label: "Band" },
          { id: "blocco", label: "Blocco" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "soglie" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>Conferma automatica</FieldLabel>
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
              className={settingsInputClass}
            />
          </label>
          <label className="block">
            <FieldLabel>Approvazione</FieldLabel>
            <input
              type="number"
              min={1}
              required
              value={form.approvalMinHours}
              onChange={(e) =>
                updateField("approvalMinHours", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
          </label>
          <label className="block">
            <FieldLabel>Annullamento</FieldLabel>
            <input
              type="number"
              min={1}
              required
              value={form.cancelMinHours}
              onChange={(e) =>
                updateField("cancelMinHours", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
          </label>
          <label className="block">
            <FieldLabel>Modifica</FieldLabel>
            <input
              type="number"
              min={1}
              required
              value={form.modifyMinHours}
              onChange={(e) =>
                updateField("modifyMinHours", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
          </label>
          <p className="text-xs text-neutral-500 sm:col-span-2">
            Ore prima dell&apos;inizio.
          </p>
        </div>
      ) : null}

      {tab === "band" ? (
        <ToggleRow
          label="Band obbligatoria"
          checked={form.bandRequired}
          onChange={(checked) => updateField("bandRequired", checked)}
        />
      ) : null}

      {tab === "blocco" ? (
        <div className="space-y-4">
          <ToggleRow
            label="Prenotazioni chiuse"
            checked={form.locked}
            onChange={(checked) => updateField("locked", checked)}
          />
          <p className="text-sm text-neutral-600">
            Gli associati non possono creare prenotazioni. Admin e segreteria
            possono ancora prenotare dal calendario. Le sale si possono
            spegnere una per una con il toggle Aperta.
          </p>
          <label className="block">
            <FieldLabel>Messaggio per gli associati</FieldLabel>
            <textarea
              rows={3}
              value={form.lockedMessage}
              onChange={(e) => updateField("lockedMessage", e.target.value)}
              className={settingsInputClass}
            />
          </label>
        </div>
      ) : null}

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
