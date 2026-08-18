"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  minutesToTimeLabel,
  timeLabelToMinutes,
  updateLessonSchoolSettings,
  type LessonSchoolSettings,
} from "@musicpro/database";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

const SLOT_OPTIONS = [5, 15, 30] as const;

type SettingsDraft = {
  gridOpen: string;
  gridClose: string;
  sundayVisible: boolean;
  slotGranularityMinutes: number;
  defaultGroupCapacity: number;
  attendanceEditDays: number;
  holdHours: number;
  reminderWeekHours: number;
  reminderDayHours: number;
  reminderSoonHours: number;
  packRemindHours1: number;
  packRemindHours2: number;
  notulaJobDay: number;
  notulaJobHour: number;
  notulaSignDeadlineDays: number;
};

function toDraft(settings: LessonSchoolSettings): SettingsDraft {
  return {
    gridOpen: minutesToTimeLabel(settings.gridOpenMinute),
    gridClose: minutesToTimeLabel(settings.gridCloseMinute),
    sundayVisible: settings.sundayVisible,
    slotGranularityMinutes: settings.slotGranularityMinutes,
    defaultGroupCapacity: settings.defaultGroupCapacity,
    attendanceEditDays: settings.attendanceEditDays,
    holdHours: settings.holdHours,
    reminderWeekHours: settings.reminderWeekHours,
    reminderDayHours: settings.reminderDayHours,
    reminderSoonHours: settings.reminderSoonHours,
    packRemindHours1: settings.packRemindHours1,
    packRemindHours2: settings.packRemindHours2,
    notulaJobDay: settings.notulaJobDay,
    notulaJobHour: settings.notulaJobHour,
    notulaSignDeadlineDays: settings.notulaSignDeadlineDays,
  };
}

export function LessonSchoolSettingsForm({
  settings,
}: {
  settings: LessonSchoolSettings;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<SettingsDraft>(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof SettingsDraft>(
    key: K,
    value: SettingsDraft[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    let gridOpenMinute: number;
    let gridCloseMinute: number;
    try {
      gridOpenMinute = timeLabelToMinutes(form.gridOpen);
      gridCloseMinute = timeLabelToMinutes(form.gridClose);
    } catch {
      setSaving(false);
      setError("Gli orari della griglia non sono validi.");
      return;
    }

    const result = await updateLessonSchoolSettings(supabase, {
      gridOpenMinute,
      gridCloseMinute,
      sundayVisible: form.sundayVisible,
      slotGranularityMinutes: form.slotGranularityMinutes,
      defaultGroupCapacity: form.defaultGroupCapacity,
      attendanceEditDays: form.attendanceEditDays,
      holdHours: form.holdHours,
      reminderWeekHours: form.reminderWeekHours,
      reminderDayHours: form.reminderDayHours,
      reminderSoonHours: form.reminderSoonHours,
      packRemindHours1: form.packRemindHours1,
      packRemindHours2: form.packRemindHours2,
      notulaJobDay: form.notulaJobDay,
      notulaJobHour: form.notulaJobHour,
      notulaSignDeadlineDays: form.notulaSignDeadlineDays,
    });

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare le impostazioni.");
      return;
    }

    setSuccess("Impostazioni scuola aggiornate.");
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

      <CollapsibleSection
        title="Calendario"
        description="Griglia usata da calendario, disponibilità e creazione corso. Orari in Europe/Rome."
        defaultOpen
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Apertura griglia">
            <input
              type="time"
              required
              value={form.gridOpen}
              onChange={(e) => updateField("gridOpen", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Chiusura griglia">
            <input
              type="time"
              required
              value={form.gridClose}
              onChange={(e) => updateField("gridClose", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Passo inizio lezione">
            <select
              value={form.slotGranularityMinutes}
              onChange={(e) =>
                updateField("slotGranularityMinutes", Number(e.target.value))
              }
              className={inputClass}
            >
              {SLOT_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minuti
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={form.sundayVisible}
            onChange={(e) => updateField("sundayVisible", e.target.checked)}
            className="mt-0.5 rounded border-neutral-300"
          />
          <span>
            <span className="font-medium">Mostra la domenica</span>
            <span className="mt-1 block text-xs text-neutral-500">
              Se spento, la domenica resta nascosta in calendario e
              disponibilità.
            </span>
          </span>
        </label>
      </CollapsibleSection>

      <CollapsibleSection title="Corsi e presenze">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Capienza gruppo default">
            <input
              type="number"
              min={1}
              required
              value={form.defaultGroupCapacity}
              onChange={(e) =>
                updateField("defaultGroupCapacity", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Finestra presenze (giorni)">
            <input
              type="number"
              min={1}
              required
              value={form.attendanceEditDays}
              onChange={(e) =>
                updateField("attendanceEditDays", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Giorni in cui si possono editare presenze passate (default 14).
            </span>
          </Field>
          <Field label="Hold sala (ore)">
            <input
              type="number"
              min={1}
              required
              value={form.holdHours}
              onChange={(e) =>
                updateField("holdHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Hold sulla prima occorrenza di un corso in attesa (default 48).
            </span>
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Reminder e solleciti"
        description="Ore prima dell’evento. I reminder lezione usano le soglie 24h e 2h; i solleciti pacchetto partono prima della 5ª lezione."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reminder lezione lungo (ore)">
            <input
              type="number"
              min={1}
              required
              value={form.reminderWeekHours}
              onChange={(e) =>
                updateField("reminderWeekHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Reminder lezione (ore)">
            <input
              type="number"
              min={1}
              required
              value={form.reminderDayHours}
              onChange={(e) =>
                updateField("reminderDayHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Reminder breve (ore)">
            <input
              type="number"
              min={1}
              required
              value={form.reminderSoonHours}
              onChange={(e) =>
                updateField("reminderSoonHours", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Sollecito pack 1 (ore)">
            <input
              type="number"
              min={1}
              required
              value={form.packRemindHours1}
              onChange={(e) =>
                updateField("packRemindHours1", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Sollecito pack 2 (ore)">
            <input
              type="number"
              min={1}
              required
              value={form.packRemindHours2}
              onChange={(e) =>
                updateField("packRemindHours2", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Notule">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Giorno job (1–28)">
            <input
              type="number"
              min={1}
              max={28}
              required
              value={form.notulaJobDay}
              onChange={(e) =>
                updateField("notulaJobDay", Number(e.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="Ora job (0–23, Rome)">
            <input
              type="number"
              min={0}
              max={23}
              required
              value={form.notulaJobHour}
              onChange={(e) =>
                updateField("notulaJobHour", Number(e.target.value))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Scadenza firma (giorni)">
            <input
              type="number"
              min={1}
              required
              value={form.notulaSignDeadlineDays}
              onChange={(e) =>
                updateField(
                  "notulaSignDeadlineDays",
                  Number(e.target.value) || 0,
                )
              }
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Dopo questa scadenza le presenze non compilate slittano al mese
              dopo.
            </span>
          </Field>
        </div>
      </CollapsibleSection>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva impostazioni scuola"}
      </button>
    </form>
  );
}

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
