"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  minutesToTimeLabel,
  timeLabelToMinutes,
  updateLessonSchoolSettings,
  type LessonSchoolSettings,
} from "@musicpro/database";

import {
  ChipGroup,
  FieldLabel,
  SettingsTabs,
  ToggleRow,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

const SLOT_OPTIONS = [5, 15, 30] as const;

type SchoolSettingsTab = "calendario" | "corsi" | "promemoria" | "notule";

const TABS: { id: SchoolSettingsTab; label: string }[] = [
  { id: "calendario", label: "Calendario" },
  { id: "corsi", label: "Corsi" },
  { id: "promemoria", label: "Promemoria" },
  { id: "notule", label: "Notule" },
];

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

  const [tab, setTab] = useState<SchoolSettingsTab>("calendario");
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

      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "calendario" ? (
        <section className="space-y-4">
          <p className="text-sm text-neutral-600">
            Orari usati da calendario, disponibilità e creazione corso (Roma).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Apertura">
              <input
                type="time"
                required
                value={form.gridOpen}
                onChange={(e) => updateField("gridOpen", e.target.value)}
                className={settingsInputClass}
              />
            </Field>
            <Field label="Chiusura">
              <input
                type="time"
                required
                value={form.gridClose}
                onChange={(e) => updateField("gridClose", e.target.value)}
                className={settingsInputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <FieldLabel>Passo inizio</FieldLabel>
              <ChipGroup
                value={String(form.slotGranularityMinutes)}
                options={SLOT_OPTIONS.map((minutes) => ({
                  value: String(minutes),
                  label: `${minutes} min`,
                }))}
                onChange={(value) =>
                  updateField("slotGranularityMinutes", Number(value))
                }
              />
            </div>
          </div>
          <ToggleRow
            label="Mostra la domenica"
            checked={form.sundayVisible}
            onChange={(checked) => updateField("sundayVisible", checked)}
          />
        </section>
      ) : null}

      {tab === "corsi" ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Posti nel gruppo">
            <input
              type="number"
              min={1}
              required
              value={form.defaultGroupCapacity}
              onChange={(e) =>
                updateField("defaultGroupCapacity", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
          </Field>
          <Field label="Giorni per le presenze">
            <input
              type="number"
              min={1}
              required
              value={form.attendanceEditDays}
              onChange={(e) =>
                updateField("attendanceEditDays", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Giorni in cui si possono modificare le presenze passate.
            </span>
          </Field>
          <Field label="Ore di blocco sala">
            <input
              type="number"
              min={1}
              required
              value={form.holdHours}
              onChange={(e) =>
                updateField("holdHours", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Blocco sulla prima lezione di un corso in attesa.
            </span>
          </Field>
        </section>
      ) : null}

      {tab === "promemoria" ? (
        <section className="space-y-4">
          <p className="text-sm text-neutral-600">
            Ore prima dell’evento. I promemoria lezione usano le soglie giorno e
            imminente; quelli del pacchetto partono prima della 5ª lezione.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Settimana">
              <input
                type="number"
                min={1}
                required
                value={form.reminderWeekHours}
                onChange={(e) =>
                  updateField("reminderWeekHours", Number(e.target.value) || 0)
                }
                className={settingsInputClass}
              />
            </Field>
            <Field label="Giorno">
              <input
                type="number"
                min={1}
                required
                value={form.reminderDayHours}
                onChange={(e) =>
                  updateField("reminderDayHours", Number(e.target.value) || 0)
                }
                className={settingsInputClass}
              />
            </Field>
            <Field label="Imminente">
              <input
                type="number"
                min={1}
                required
                value={form.reminderSoonHours}
                onChange={(e) =>
                  updateField("reminderSoonHours", Number(e.target.value) || 0)
                }
                className={settingsInputClass}
              />
            </Field>
            <Field label="Pacchetto">
              <input
                type="number"
                min={1}
                required
                value={form.packRemindHours1}
                onChange={(e) =>
                  updateField("packRemindHours1", Number(e.target.value) || 0)
                }
                className={settingsInputClass}
              />
            </Field>
            <Field label="Pacchetto (2°)">
              <input
                type="number"
                min={1}
                required
                value={form.packRemindHours2}
                onChange={(e) =>
                  updateField("packRemindHours2", Number(e.target.value) || 0)
                }
                className={settingsInputClass}
              />
            </Field>
          </div>
        </section>
      ) : null}

      {tab === "notule" ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Giorno">
            <input
              type="number"
              min={1}
              max={28}
              required
              value={form.notulaJobDay}
              onChange={(e) =>
                updateField("notulaJobDay", Number(e.target.value) || 0)
              }
              className={settingsInputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Giorno del mese (1–28).
            </span>
          </Field>
          <Field label="Ora">
            <input
              type="number"
              min={0}
              max={23}
              required
              value={form.notulaJobHour}
              onChange={(e) =>
                updateField("notulaJobHour", Number(e.target.value))
              }
              className={settingsInputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Dalle 0 alle 23, orario di Roma.
            </span>
          </Field>
          <Field label="Scadenza firma">
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
              className={settingsInputClass}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Dopo questa scadenza le presenze non compilate slittano al mese
              dopo.
            </span>
          </Field>
        </section>
      ) : null}

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
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}
