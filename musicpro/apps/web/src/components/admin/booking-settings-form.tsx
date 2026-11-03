"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  PENDING_HOLD_HOUR_OPTIONS,
  type BookingSettings,
  type BookingSettingsInput,
  type LastMinuteCampaign,
  type OperationalWeekSchedule,
  updateBookingSettings,
} from "@musicpro/database";

import { BookingOperationalSettingsSection } from "@/components/admin/booking-operational-settings-section";
import {
  FieldLabel,
  ToggleRow,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { settingsPrimaryButtonClass } from "@/components/admin/settings-page-chrome";
import { createClient } from "@/lib/supabase/client";

interface BookingSettingsFormProps {
  settings: BookingSettings;
  operationalSchedule: OperationalWeekSchedule;
  recentLastMinuteCampaigns: LastMinuteCampaign[];
}

function settingsToInput(settings: BookingSettings): BookingSettingsInput {
  return {
    autoConfirmMinHours: settings.autoConfirmMinHours,
    approvalMinHours: settings.approvalMinHours,
    cancelMinHours: settings.cancelMinHours,
    modifyMinHours: settings.modifyMinHours,
    bandRequired: settings.bandRequired,
    locked: settings.locked,
    lockedMessage: settings.lockedMessage,
    collaboratorDiscountPercent: settings.collaboratorDiscountPercent,
    pendingBlocksSlot: settings.pendingBlocksSlot,
    pendingHoldHours: settings.pendingHoldHours,
  };
}

export function BookingSettingsForm({
  settings,
  operationalSchedule,
  recentLastMinuteCampaigns,
}: BookingSettingsFormProps) {
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
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <FieldLabel>Conferma automatica</FieldLabel>
          <input
            type="number"
            min={1}
            required
            value={form.autoConfirmMinHours}
            onChange={(e) =>
              updateField("autoConfirmMinHours", Number(e.target.value) || 0)
            }
            className={settingsInputClass}
          />
        </label>
        <label className="block min-w-0">
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
        <label className="block min-w-0">
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
        <label className="block min-w-0">
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
        <label className="block min-w-0">
          <FieldLabel>Sconto collaboratore %</FieldLabel>
          <input
            type="number"
            min={0}
            max={100}
            required
            value={form.collaboratorDiscountPercent}
            onChange={(e) =>
              updateField(
                "collaboratorDiscountPercent",
                Number(e.target.value) || 0,
              )
            }
            className={settingsInputClass}
          />
        </label>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
            <input
              type="checkbox"
              checked={form.pendingBlocksSlot}
              onChange={(e) =>
                updateField("pendingBlocksSlot", e.target.checked)
              }
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Pending blocca lo slot
          </label>
          <select
            aria-label="Durata pending"
            value={form.pendingHoldHours}
            disabled={!form.pendingBlocksSlot}
            onChange={(e) =>
              updateField("pendingHoldHours", Number(e.target.value) || 4)
            }
            className="min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:opacity-50"
          >
            {PENDING_HOLD_HOUR_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {hours === 1 ? "1 ora" : `${hours} ore`}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-neutral-500 sm:col-span-2">
          Ore prima dell&apos;inizio. Lo sconto vale per il ruolo Collaboratore
          sulla scheda associato.
        </p>
      </div>

      <ToggleRow
        label="Band obbligatoria"
        checked={form.bandRequired}
        onChange={(checked) => updateField("bandRequired", checked)}
      />

      <div className="space-y-3">
        <ToggleRow
          label="Prenotazioni chiuse"
          checked={form.locked}
          onChange={(checked) => updateField("locked", checked)}
        />
        <p className="text-sm text-neutral-600">
          Gli associati non possono creare prenotazioni; admin e segreteria
          possono ancora prenotare dal calendario.
        </p>
        <label className="block min-w-0">
          <FieldLabel>Messaggio per gli associati</FieldLabel>
          <textarea
            rows={3}
            value={form.lockedMessage}
            onChange={(e) => updateField("lockedMessage", e.target.value)}
            className={settingsInputClass}
          />
        </label>
      </div>

      <BookingOperationalSettingsSection
        initialSchedule={operationalSchedule}
        recentCampaigns={recentLastMinuteCampaigns}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={settingsPrimaryButtonClass}
        >
          {saving ? "Salvataggio…" : "Salva impostazioni"}
        </button>
      </div>
    </form>
  );
}
