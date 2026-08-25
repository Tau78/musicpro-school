"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  closeMinuteToTimeInput,
  defaultOpeningDay,
  formatDurationLabel,
  formatEuro,
  listProviSchedule,
  listRoomOpeningDays,
  minutesToTimeLabel,
  proviDayLabel,
  roomToInput,
  saveProviSchedule,
  saveRoomOpeningDays,
  timeInputToCloseMinute,
  timeLabelToMinutes,
  updateRoom,
  type OpeningMode,
  type Room,
  type RoomInput,
  type RoomOpeningDayInput,
} from "@musicpro/database";

import { RoomExternalCalendarsPanel } from "@/components/admin/room-external-calendars-panel";
import { RoomSpecialDaysPanel } from "@/components/admin/room-special-days-panel";
import {
  ChipGroup,
  FieldLabel,
  ToggleRow,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import {
  SettingsStickySaveBar,
  settingsPrimaryButtonClass,
} from "@/components/admin/settings-page-chrome";
import { type RoomTab } from "@/lib/admin/room-tabs";
import { createClient } from "@/lib/supabase/client";

interface DayScheduleRow {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface RoomFormProps {
  room: Room;
  tab: RoomTab;
  otherRooms?: Array<{ id: string; name: string }>;
}

const SLOT_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 ora" },
];

const DEFAULT_DURATION_OPTIONS = [
  { value: "60", label: "1 ora" },
  { value: "90", label: "1,5 ore" },
  { value: "120", label: "2 ore" },
  { value: "180", label: "3 ore" },
  { value: "240", label: "4 ore" },
];

const MIN_DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 ora" },
  { value: "90", label: "1,5 ore" },
];

const MAX_DURATION_OPTIONS = [
  { value: "120", label: "2 ore" },
  { value: "180", label: "3 ore" },
  { value: "240", label: "4 ore" },
  { value: "360", label: "6 ore" },
];

const GOOGLE_COLOR_OPTIONS = [
  { value: "1", label: "Lavanda" },
  { value: "2", label: "Salvia" },
  { value: "3", label: "Uva" },
  { value: "4", label: "Fenicottero" },
  { value: "5", label: "Banana" },
  { value: "6", label: "Tangerino" },
  { value: "7", label: "Pavone" },
  { value: "8", label: "Grafite" },
  { value: "9", label: "Mirtillo" },
  { value: "10", label: "Basilico" },
  { value: "11", label: "Pomodoro" },
];

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;

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

function optionsWithCurrent(
  options: { value: string; label: string }[],
  current: string,
  extraLabel: (value: string) => string,
) {
  if (!current || options.some((option) => option.value === current)) {
    return options;
  }
  return [...options, { value: current, label: extraLabel(current) }];
}

function buildTimeOptions(extra?: string): string[] {
  const options: string[] = [];
  for (let minute = 0; minute < 24 * 60; minute += 30) {
    options.push(minutesToTimeLabel(minute));
  }
  if (extra && !options.includes(extra)) {
    options.push(extra);
    options.sort();
  }
  return options;
}

function hoursPhrase(minutes: number): string {
  const hours = minutes / 60;
  if (hours === 1) return "1 ora";
  const text = Number.isInteger(hours)
    ? String(hours)
    : hours.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  return `${text} ore`;
}

function formatPlainEuro(amount: number): string {
  return amount.toLocaleString("it-IT", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function RoomForm({ room, tab, otherRooms = [] }: RoomFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<RoomInput>(() => roomToInput(room));
  const [dayRows, setDayRows] = useState<DayScheduleRow[]>(defaultDayRows());
  const [openingDays, setOpeningDays] = useState<RoomOpeningDayInput[]>(() =>
    Array.from({ length: 7 }, (_, dayOfWeek) =>
      defaultOpeningDay(dayOfWeek, room.open_minute, room.close_minute),
    ),
  );
  const [copyFromId, setCopyFromId] = useState("");
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      listProviSchedule(supabase, room.id),
      listRoomOpeningDays(supabase, room.id),
    ])
      .then(([entries, weekly]) => {
        if (cancelled) return;
        setDayRows(scheduleToDayRows(entries));
        if (weekly.length > 0) {
          const next = Array.from({ length: 7 }, (_, dayOfWeek) => {
            const found = weekly.find((row) => row.dayOfWeek === dayOfWeek);
            return found
              ? {
                  dayOfWeek: found.dayOfWeek,
                  mode: found.mode,
                  startMinute: found.startMinute,
                  endMinute: found.endMinute,
                  morningStartMinute: found.morningStartMinute,
                  morningEndMinute: found.morningEndMinute,
                  afternoonStartMinute: found.afternoonStartMinute,
                  afternoonEndMinute: found.afternoonEndMinute,
                }
              : defaultOpeningDay(
                  dayOfWeek,
                  room.open_minute,
                  room.close_minute,
                );
          });
          setOpeningDays(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare gli orari.",
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
      await saveRoomOpeningDays(supabase, room.id, openingDays);
      setSuccess("Sala salvata.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salvataggio griglia non riuscito.",
      );
    } finally {
      setSaving(false);
    }
  }

  const defaultBlockPrice =
    (form.hourlyRateEur * form.defaultDurationMinutes) / 60;
  const soloPayPerHour = Math.max(
    0,
    form.hourlyRateEur - form.proviDaSoloDiscountEur,
  );
  const openTimeValue = minutesToTimeLabel(form.openMinute);
  const closeTimeValue = closeMinuteToTimeInput(form.closeMinute);
  const openTimeOptions = buildTimeOptions(openTimeValue);
  const closeTimeOptions = buildTimeOptions(closeTimeValue);
  const colorValue = form.googleCalendarColorId ?? "";

  return (
    <div className="max-w-3xl space-y-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-4 pb-4"
      >
        <div className="min-w-[8rem]">
          <ToggleRow
            label="Aperta"
            checked={form.isActive}
            onChange={(checked) => updateField("isActive", checked)}
          />
        </div>

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

        {tab === "sala" && (
          <div className="space-y-5">
            <div>
              <label htmlFor="name">
                <FieldLabel>Nome</FieldLabel>
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={settingsInputClass}
              />
            </div>

            <div>
              <label htmlFor="hourlyRateEur">
                <FieldLabel>Prezzo all’ora</FieldLabel>
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
                className={settingsInputClass}
              />
              <p className="mt-1 text-xs text-neutral-500">
                {hoursPhrase(form.defaultDurationMinutes)} ={" "}
                {formatPlainEuro(defaultBlockPrice)} €
              </p>
            </div>

            <div>
              <FieldLabel>Colore</FieldLabel>
              <input
                id="googleCalendarColorId"
                type="hidden"
                value={colorValue}
              />
              <ChipGroup
                value={colorValue}
                options={optionsWithCurrent(
                  GOOGLE_COLOR_OPTIONS,
                  colorValue,
                  (value) => value,
                )}
                onChange={(value) =>
                  updateField("googleCalendarColorId", value || null)
                }
              />
            </div>
          </div>
        )}

        {tab === "orari" && (
          <div className="space-y-5">
            {otherRooms.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1">
                  <FieldLabel>Copia orari da</FieldLabel>
                  <select
                    value={copyFromId}
                    onChange={(e) => setCopyFromId(e.target.value)}
                    className={settingsInputClass}
                  >
                    <option value="">Scegli una sala…</option>
                    {otherRooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!copyFromId}
                  onClick={() => {
                    if (!copyFromId) return;
                    void listRoomOpeningDays(supabase, copyFromId)
                      .then((weekly) => {
                        if (weekly.length === 0) {
                          setError("La sala scelta non ha orari settimanali.");
                          return;
                        }
                        setOpeningDays(
                          Array.from({ length: 7 }, (_, dayOfWeek) => {
                            const found = weekly.find(
                              (row) => row.dayOfWeek === dayOfWeek,
                            );
                            return found
                              ? {
                                  dayOfWeek: found.dayOfWeek,
                                  mode: found.mode,
                                  startMinute: found.startMinute,
                                  endMinute: found.endMinute,
                                  morningStartMinute: found.morningStartMinute,
                                  morningEndMinute: found.morningEndMinute,
                                  afternoonStartMinute:
                                    found.afternoonStartMinute,
                                  afternoonEndMinute: found.afternoonEndMinute,
                                }
                              : defaultOpeningDay(
                                  dayOfWeek,
                                  form.openMinute,
                                  form.closeMinute,
                                );
                          }),
                        );
                        setSuccess("Orari copiati. Premi Salva per confermare.");
                      })
                      .catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Copia non riuscita.",
                        ),
                      );
                  }}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Copia
                </button>
              </div>
            ) : null}

            <div className="space-y-3">
              <FieldLabel>Orario per giorno</FieldLabel>
              {DAY_ORDER.map((dayOfWeek) => {
                const row = openingDays.find((d) => d.dayOfWeek === dayOfWeek);
                if (!row) return null;
                return (
                  <div
                    key={dayOfWeek}
                    className="rounded-xl border border-neutral-200 bg-white p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-900">
                        {DAY_SHORT[dayOfWeek]}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {(
                          [
                            ["open", "Aperto"],
                            ["split", "Matt/Pom"],
                            ["closed", "Chiuso"],
                          ] as const
                        ).map(([value, label]) => (
                          <label
                            key={value}
                            className="inline-flex items-center gap-1.5"
                          >
                            <input
                              type="radio"
                              name={`open-mode-${dayOfWeek}`}
                              checked={row.mode === value}
                              onChange={() =>
                                setOpeningDays((prev) =>
                                  prev.map((item) =>
                                    item.dayOfWeek === dayOfWeek
                                      ? { ...item, mode: value as OpeningMode }
                                      : item,
                                  ),
                                )
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {row.mode === "open" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <MinuteSelect
                          label="Dalle"
                          value={row.startMinute}
                          onChange={(startMinute) =>
                            setOpeningDays((prev) =>
                              prev.map((item) =>
                                item.dayOfWeek === dayOfWeek
                                  ? { ...item, startMinute }
                                  : item,
                              ),
                            )
                          }
                        />
                        <MinuteSelect
                          label="Alle"
                          value={row.endMinute > 1440 ? 1440 : row.endMinute}
                          allowMidnight
                          onChange={(endMinute) =>
                            setOpeningDays((prev) =>
                              prev.map((item) =>
                                item.dayOfWeek === dayOfWeek
                                  ? { ...item, endMinute }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                    ) : null}
                    {row.mode === "split" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <MinuteSelect
                          label="Mattina dalle"
                          value={row.morningStartMinute}
                          onChange={(morningStartMinute) =>
                            setOpeningDays((prev) =>
                              prev.map((item) =>
                                item.dayOfWeek === dayOfWeek
                                  ? { ...item, morningStartMinute }
                                  : item,
                              ),
                            )
                          }
                        />
                        <MinuteSelect
                          label="Mattina alle"
                          value={row.morningEndMinute}
                          onChange={(morningEndMinute) =>
                            setOpeningDays((prev) =>
                              prev.map((item) =>
                                item.dayOfWeek === dayOfWeek
                                  ? { ...item, morningEndMinute }
                                  : item,
                              ),
                            )
                          }
                        />
                        <MinuteSelect
                          label="Pomeriggio dalle"
                          value={row.afternoonStartMinute}
                          onChange={(afternoonStartMinute) =>
                            setOpeningDays((prev) =>
                              prev.map((item) =>
                                item.dayOfWeek === dayOfWeek
                                  ? { ...item, afternoonStartMinute }
                                  : item,
                              ),
                            )
                          }
                        />
                        <MinuteSelect
                          label="Pomeriggio alle"
                          value={
                            row.afternoonEndMinute > 1440
                              ? 1440
                              : row.afternoonEndMinute
                          }
                          allowMidnight
                          onChange={(afternoonEndMinute) =>
                            setOpeningDays((prev) =>
                              prev.map((item) =>
                                item.dayOfWeek === dayOfWeek
                                  ? { ...item, afternoonEndMinute }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="openMinute">
                  <FieldLabel>Apertura</FieldLabel>
                </label>
                <select
                  id="openMinute"
                  value={openTimeValue}
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
                  className={settingsInputClass}
                >
                  {openTimeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="closeMinute">
                  <FieldLabel>Chiusura</FieldLabel>
                </label>
                <select
                  id="closeMinute"
                  value={closeTimeValue}
                  onChange={(e) =>
                    updateField(
                      "closeMinute",
                      timeInputToCloseMinute(form.openMinute, e.target.value),
                    )
                  }
                  className={settingsInputClass}
                >
                  {closeTimeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
                {form.closeMinute >= 1440 ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    {form.closeMinute === 1440 ? "Mezzanotte" : "Giorno dopo"}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <FieldLabel>Ogni</FieldLabel>
              <input
                id="slotGranularityMinutes"
                type="hidden"
                value={form.slotGranularityMinutes}
              />
              <ChipGroup
                value={String(form.slotGranularityMinutes)}
                options={optionsWithCurrent(
                  SLOT_OPTIONS,
                  String(form.slotGranularityMinutes),
                  (value) => formatDurationLabel(Number(value)),
                )}
                onChange={(value) =>
                  updateField("slotGranularityMinutes", Number(value))
                }
              />
            </div>

            <div>
              <FieldLabel>Durata predefinita</FieldLabel>
              <input
                id="defaultDurationMinutes"
                type="hidden"
                value={form.defaultDurationMinutes}
              />
              <ChipGroup
                value={String(form.defaultDurationMinutes)}
                options={optionsWithCurrent(
                  DEFAULT_DURATION_OPTIONS,
                  String(form.defaultDurationMinutes),
                  (value) => formatDurationLabel(Number(value)),
                )}
                onChange={(value) =>
                  updateField("defaultDurationMinutes", Number(value))
                }
              />
            </div>

            <div>
              <FieldLabel>Durata minima</FieldLabel>
              <input
                id="minDurationMinutes"
                type="hidden"
                value={form.minDurationMinutes}
              />
              <ChipGroup
                value={String(form.minDurationMinutes)}
                options={optionsWithCurrent(
                  MIN_DURATION_OPTIONS,
                  String(form.minDurationMinutes),
                  (value) => formatDurationLabel(Number(value)),
                )}
                onChange={(value) =>
                  updateField("minDurationMinutes", Number(value))
                }
              />
            </div>

            <div>
              <FieldLabel>Durata massima</FieldLabel>
              <input
                id="maxDurationMinutes"
                type="hidden"
                value={form.maxDurationMinutes}
              />
              <ChipGroup
                value={String(form.maxDurationMinutes)}
                options={optionsWithCurrent(
                  MAX_DURATION_OPTIONS,
                  String(form.maxDurationMinutes),
                  (value) => formatDurationLabel(Number(value)),
                )}
                onChange={(value) =>
                  updateField("maxDurationMinutes", Number(value))
                }
              />
            </div>

            <RoomSpecialDaysPanel
              roomId={room.id}
              defaultOpenMinute={form.openMinute}
              defaultCloseMinute={form.closeMinute}
            />
          </div>
        )}

        {tab === "dasolo" && (
          <div className="space-y-5">
            <ToggleRow
              label="Prenota da solo"
              checked={form.proviDaSoloEnabled}
              onChange={(checked) =>
                updateField("proviDaSoloEnabled", checked)
              }
            />

            {!form.proviDaSoloEnabled ? (
              <p className="text-sm text-neutral-600">
                Spento. Nessuno può prenotare da solo.
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="proviDaSoloDiscountEur">
                    <FieldLabel>Sconto all’ora</FieldLabel>
                  </label>
                  <input
                    id="proviDaSoloDiscountEur"
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.proviDaSoloDiscountEur}
                    onChange={(e) =>
                      updateField(
                        "proviDaSoloDiscountEur",
                        Number(e.target.value),
                      )
                    }
                    className={settingsInputClass}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Paga {formatEuro(soloPayPerHour)} / ora
                  </p>
                </div>

                <div>
                  <FieldLabel>Giorni</FieldLabel>
                  {loadingSchedule ? (
                    <p className="text-sm text-neutral-500">
                      Caricamento orari…
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-1.5">
                        {DAY_ORDER.map((dayOfWeek) => {
                          const row = dayRows.find(
                            (item) => item.dayOfWeek === dayOfWeek,
                          );
                          const enabled = row?.enabled ?? false;
                          return (
                            <button
                              key={dayOfWeek}
                              type="button"
                              aria-pressed={enabled}
                              onClick={() =>
                                updateDayRow(dayOfWeek, { enabled: !enabled })
                              }
                              className={
                                enabled
                                  ? "rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white"
                                  : "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                              }
                            >
                              {DAY_SHORT[dayOfWeek]}
                            </button>
                          );
                        })}
                      </div>

                      {DAY_ORDER.map((dayOfWeek) => {
                        const row = dayRows.find(
                          (item) => item.dayOfWeek === dayOfWeek,
                        );
                        if (!row?.enabled) return null;
                        const startOptions = buildTimeOptions(row.startTime);
                        const endOptions = buildTimeOptions(row.endTime);
                        return (
                          <div
                            key={`hours-${dayOfWeek}`}
                            className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr] sm:items-end"
                          >
                            <p className="text-sm font-medium text-neutral-800">
                              {proviDayLabel(dayOfWeek)}
                            </p>
                            <div>
                              <FieldLabel>Dalle</FieldLabel>
                              <select
                                value={row.startTime}
                                onChange={(e) =>
                                  updateDayRow(dayOfWeek, {
                                    startTime: e.target.value,
                                  })
                                }
                                className={settingsInputClass}
                              >
                                {startOptions.map((time) => (
                                  <option key={time} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <FieldLabel>Alle</FieldLabel>
                              <select
                                value={row.endTime}
                                onChange={(e) =>
                                  updateDayRow(dayOfWeek, {
                                    endTime: e.target.value,
                                  })
                                }
                                className={settingsInputClass}
                              >
                                {endOptions.map((time) => (
                                  <option key={time} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab !== "calendari" ? (
          <SettingsStickySaveBar>
            <button
              type="submit"
              disabled={saving || loadingSchedule}
              className={settingsPrimaryButtonClass}
            >
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </SettingsStickySaveBar>
        ) : null}
      </form>

      <div hidden={tab !== "calendari"}>
        <RoomExternalCalendarsPanel roomId={room.id} />
      </div>
    </div>
  );
}

function MinuteSelect({
  label,
  value,
  onChange,
  allowMidnight = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  allowMidnight?: boolean;
}) {
  const options: { value: number; label: string }[] = [];
  for (let minute = 0; minute < 24 * 60; minute += 30) {
    options.push({ value: minute, label: minutesToTimeLabel(minute) });
  }
  if (allowMidnight) {
    options.push({ value: 1440, label: "24:00" });
  }
  if (!options.some((option) => option.value === value)) {
    options.push({
      value,
      label: value === 1440 ? "24:00" : minutesToTimeLabel(value),
    });
  }

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={settingsInputClass}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
