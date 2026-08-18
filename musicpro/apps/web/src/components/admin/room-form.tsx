"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  closeMinuteHint,
  closeMinuteToTimeInput,
  formatDurationLabel,
  formatEuro,
  listProviSchedule,
  minutesToTimeLabel,
  proviDayLabel,
  roomToInput,
  saveProviSchedule,
  timeInputToCloseMinute,
  timeLabelToMinutes,
  updateRoom,
  type Room,
  type RoomInput,
} from "@musicpro/database";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { createClient } from "@/lib/supabase/client";

interface DayScheduleRow {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface RoomFormProps {
  room: Room;
}

function defaultDayRows(): DayScheduleRow[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: false,
    startTime: "14:00",
    endTime: "18:00",
  }));
}

function scheduleToDayRows(
  entries: Awaited<ReturnType<typeof listProviSchedule>>,
): DayScheduleRow[] {
  const rows = defaultDayRows();

  for (const entry of entries) {
    const row = rows.find((item) => item.dayOfWeek === entry.dayOfWeek);
    if (!row) continue;
    row.enabled = entry.enabled;
    row.startTime = minutesToTimeLabel(entry.startMinute);
    row.endTime = minutesToTimeLabel(entry.endMinute);
  }

  return rows;
}

function dayRowsToSchedule(
  rows: DayScheduleRow[],
): Array<{
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
}> {
  return rows
    .filter((row) => row.enabled)
    .map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startMinute: timeLabelToMinutes(row.startTime),
      endMinute: timeLabelToMinutes(row.endTime),
      enabled: true,
    }))
    .filter((row) => row.endMinute > row.startMinute);
}

export function RoomForm({ room }: RoomFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<RoomInput>(() => roomToInput(room));
  const [dayRows, setDayRows] = useState<DayScheduleRow[]>(defaultDayRows());
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listProviSchedule(supabase, room.id)
      .then((entries) => {
        if (!cancelled) setDayRows(scheduleToDayRows(entries));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare la griglia PROVI DA SOLO.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSchedule(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room.id, supabase]);

  function updateField<K extends keyof RoomInput>(key: K, value: RoomInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDayRow(
    dayOfWeek: number,
    patch: Partial<Omit<DayScheduleRow, "dayOfWeek">>,
  ) {
    setDayRows((prev) =>
      prev.map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row,
      ),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await updateRoom(supabase, room.id, form);

    if (!result.success) {
      setSaving(false);
      setError(result.errorMessage ?? "Salvataggio non riuscito.");
      return;
    }

    try {
      await saveProviSchedule(supabase, room.id, dayRowsToSchedule(dayRows));
      setSuccess("Configurazione sala salvata.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salvataggio griglia non riuscito.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="max-w-3xl space-y-4"
    >
      <CollapsibleSection title="Tariffe e orari" defaultOpen>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
            Nome
          </label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="hourlyRateEur"
              className="block text-sm font-medium text-neutral-700"
            >
              Tariffa oraria (€)
            </label>
            <input
              id="hourlyRateEur"
              type="number"
              min={0}
              step={0.5}
              value={form.hourlyRateEur}
              onChange={(e) =>
                updateField("hourlyRateEur", Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField("isActive", e.target.checked)}
                className="rounded border-neutral-300"
              />
              Sala attiva
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="openMinute" className="block text-sm font-medium text-neutral-700">
              Apertura
            </label>
            <input
              id="openMinute"
              type="time"
              value={minutesToTimeLabel(form.openMinute)}
              onChange={(e) => {
                const openMinute = timeLabelToMinutes(e.target.value);
                setForm((prev) => ({
                  ...prev,
                  openMinute,
                  closeMinute: timeInputToCloseMinute(
                    openMinute,
                    closeMinuteToTimeInput(prev.closeMinute),
                  ),
                }));
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="closeMinute" className="block text-sm font-medium text-neutral-700">
              Chiusura
            </label>
            <input
              id="closeMinute"
              type="time"
              value={closeMinuteToTimeInput(form.closeMinute)}
              onChange={(e) =>
                updateField(
                  "closeMinute",
                  timeInputToCloseMinute(form.openMinute, e.target.value),
                )
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              {closeMinuteHint(form.openMinute, form.closeMinute)}. 00:00 =
              mezzanotte; un orario prima dell&apos;apertura è il giorno dopo.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="slotGranularityMinutes"
              className="block text-sm font-medium text-neutral-700"
            >
              Granularità slot (min)
            </label>
            <input
              id="slotGranularityMinutes"
              type="number"
              min={15}
              step={15}
              value={form.slotGranularityMinutes}
              onChange={(e) =>
                updateField("slotGranularityMinutes", Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="googleCalendarColorId"
              className="block text-sm font-medium text-neutral-700"
            >
              Colore Google Calendar
            </label>
            <input
              id="googleCalendarColorId"
              type="text"
              value={form.googleCalendarColorId ?? ""}
              onChange={(e) =>
                updateField("googleCalendarColorId", e.target.value || null)
              }
              placeholder="es. 11"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="defaultDurationMinutes"
              className="block text-sm font-medium text-neutral-700"
            >
              Durata default
            </label>
            <input
              id="defaultDurationMinutes"
              type="number"
              min={15}
              step={15}
              value={form.defaultDurationMinutes}
              onChange={(e) =>
                updateField("defaultDurationMinutes", Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              {formatDurationLabel(form.defaultDurationMinutes)}
            </p>
          </div>
          <div>
            <label
              htmlFor="minDurationMinutes"
              className="block text-sm font-medium text-neutral-700"
            >
              Durata min
            </label>
            <input
              id="minDurationMinutes"
              type="number"
              min={15}
              step={15}
              value={form.minDurationMinutes}
              onChange={(e) =>
                updateField("minDurationMinutes", Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="maxDurationMinutes"
              className="block text-sm font-medium text-neutral-700"
            >
              Durata max
            </label>
            <input
              id="maxDurationMinutes"
              type="number"
              min={15}
              step={15}
              value={form.maxDurationMinutes}
              onChange={(e) =>
                updateField("maxDurationMinutes", Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="PROVI DA SOLO"
        description="Prenotazione senza banda nelle fasce configurate, con sconto orario."
      >

        <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <input
            type="checkbox"
            checked={form.proviDaSoloEnabled}
            onChange={(e) => updateField("proviDaSoloEnabled", e.target.checked)}
            className="rounded border-neutral-300"
          />
          Abilita PROVI DA SOLO per questa sala
        </label>

        <div>
          <label
            htmlFor="proviDaSoloDiscountEur"
            className="block text-sm font-medium text-neutral-700"
          >
            Sconto PROVI DA SOLO (€/ora)
          </label>
          <input
            id="proviDaSoloDiscountEur"
            type="number"
            min={0}
            step={0.5}
            value={form.proviDaSoloDiscountEur}
            onChange={(e) =>
              updateField("proviDaSoloDiscountEur", Number(e.target.value))
            }
            className="mt-1 w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Es. {formatEuro(2)} — sconto per ogni ora di prenotazione.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-neutral-700">
            Griglia settimanale (orario locale Roma)
          </h4>
          {loadingSchedule ? (
            <p className="mt-3 text-sm text-neutral-500">Caricamento griglia…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 pr-4 font-medium">Giorno</th>
                    <th className="py-2 pr-4 font-medium">Attivo</th>
                    <th className="py-2 pr-4 font-medium">Dalle</th>
                    <th className="py-2 font-medium">Alle</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((row) => (
                    <tr key={row.dayOfWeek} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-medium text-neutral-800">
                        {proviDayLabel(row.dayOfWeek)}
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) =>
                            updateDayRow(row.dayOfWeek, {
                              enabled: e.target.checked,
                            })
                          }
                          className="rounded border-neutral-300"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="time"
                          value={row.startTime}
                          disabled={!row.enabled}
                          onChange={(e) =>
                            updateDayRow(row.dayOfWeek, {
                              startTime: e.target.value,
                            })
                          }
                          className="rounded-lg border border-neutral-300 px-2 py-1 disabled:bg-neutral-50"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="time"
                          value={row.endTime}
                          disabled={!row.enabled}
                          onChange={(e) =>
                            updateDayRow(row.dayOfWeek, {
                              endTime: e.target.value,
                            })
                          }
                          className="rounded-lg border border-neutral-300 px-2 py-1 disabled:bg-neutral-50"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {success && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || loadingSchedule}
        className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {saving ? "Salvataggio…" : "Salva configurazione"}
      </button>
    </form>
  );
}
