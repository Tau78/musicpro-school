"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  type IsoWeekday,
  createTeacherTimeOff,
  deleteTeacherTimeOff,
  getRomeDayBoundsUtc,
  minutesToTimeLabel,
  replaceTeacherAvailability,
  romeLocalInputToUtcIso,
  timeLabelToMinutes,
} from "@musicpro/database";

import {
  FieldLabel,
  ToggleRow,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

export interface TeacherAvailabilitySlotProp {
  id?: string;
  dayOfWeek: IsoWeekday;
  startMinute: number;
  endMinute: number;
}

export interface TeacherTimeOffProp {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface TeacherAvailabilityPanelProps {
  memberId: string;
  initialSlots: TeacherAvailabilitySlotProp[];
  initialTimeOff: TeacherTimeOffProp[];
  sundayVisible: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  readOnly?: boolean;
}

type DraftSlot = TeacherAvailabilitySlotProp & { key: string };

const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

const DAY_LABELS: Record<IsoWeekday, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  7: "Domenica",
};

const TIME_STEP_SECONDS = 15 * 60;

const inputClass = `${settingsInputClass} disabled:bg-neutral-50 disabled:text-neutral-500`;

function nextDraftKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDraftSlots(slots: TeacherAvailabilitySlotProp[]): DraftSlot[] {
  return slots.map((slot) => ({
    ...slot,
    key: slot.id ?? nextDraftKey(),
  }));
}

function defaultSlotRange(
  openMinute: number,
  closeMinute: number,
): { startMinute: number; endMinute: number } {
  const startMinute = openMinute;
  let endMinute = startMinute + 60;
  if (endMinute > closeMinute) endMinute = closeMinute;
  if (endMinute <= startMinute) endMinute = startMinute + 15;
  return { startMinute, endMinute };
}

function romeClock(iso: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

function formatTimeOffRange(startsAt: string, endsAt: string): string {
  const startClock = romeClock(startsAt);
  const endClock = romeClock(endsAt);
  const isWholeDays =
    startClock.hour === 0 &&
    startClock.minute === 0 &&
    endClock.hour === 0 &&
    endClock.minute === 0;

  if (isWholeDays) {
    const dateFmt = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    // endsAt è la mezzanotte successiva (esclusiva) dell'ultimo giorno.
    const lastInclusive = new Date(new Date(endsAt).getTime() - 1);
    const startLabel = dateFmt.format(new Date(startsAt));
    const endLabel = dateFmt.format(lastInclusive);
    return startLabel === endLabel
      ? startLabel
      : `${startLabel} – ${endLabel}`;
  }

  const fmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`;
}

export function TeacherAvailabilityPanel({
  memberId,
  initialSlots,
  initialTimeOff,
  sundayVisible,
  gridOpenMinute,
  gridCloseMinute,
  readOnly = false,
}: TeacherAvailabilityPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [slots, setSlots] = useState<DraftSlot[]>(() =>
    toDraftSlots(initialSlots),
  );
  const [timeOff, setTimeOff] = useState<TeacherTimeOffProp[]>(initialTimeOff);

  const [offHasTimeRange, setOffHasTimeRange] = useState(false);
  const [offFrom, setOffFrom] = useState("");
  const [offTo, setOffTo] = useState("");
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");

  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOff, setSavingOff] = useState(false);
  const [deletingOffId, setDeletingOffId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const visibleDays = sundayVisible
    ? WEEKDAYS
    : WEEKDAYS.filter((day) => day !== 7);

  const gridMin = minutesToTimeLabel(gridOpenMinute);
  const gridMax =
    gridCloseMinute >= 1440 ? undefined : minutesToTimeLabel(gridCloseMinute);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcomingItems = timeOff
      .filter((item) => new Date(item.endsAt).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    const pastItems = timeOff
      .filter((item) => new Date(item.endsAt).getTime() < now)
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      );
    return { upcoming: upcomingItems, past: pastItems };
  }, [timeOff]);

  function slotsForDay(day: IsoWeekday): DraftSlot[] {
    return slots
      .filter((slot) => slot.dayOfWeek === day)
      .sort((a, b) => a.startMinute - b.startMinute);
  }

  function updateSlot(
    key: string,
    patch: Partial<Pick<DraftSlot, "startMinute" | "endMinute">>,
  ) {
    setSlots((prev) =>
      prev.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
    );
  }

  function addSlot(day: IsoWeekday) {
    const { startMinute, endMinute } = defaultSlotRange(
      gridOpenMinute,
      gridCloseMinute,
    );
    setSlots((prev) => [
      ...prev,
      {
        key: nextDraftKey(),
        dayOfWeek: day,
        startMinute,
        endMinute,
      },
    ]);
  }

  function removeSlot(key: string) {
    setSlots((prev) => prev.filter((slot) => slot.key !== key));
  }

  async function handleSaveWeekly(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    setSavingWeekly(true);
    setError(null);
    setSuccess(null);

    for (const slot of slots) {
      if (slot.endMinute <= slot.startMinute) {
        setSavingWeekly(false);
        setError(
          `Su ${DAY_LABELS[slot.dayOfWeek]} l'orario di fine deve essere successivo all'inizio.`,
        );
        return;
      }
    }

    const result = await replaceTeacherAvailability(
      supabase,
      memberId,
      slots.map(({ dayOfWeek, startMinute, endMinute }) => ({
        dayOfWeek,
        startMinute,
        endMinute,
      })),
    );

    setSavingWeekly(false);

    if (!result.success) {
      setError(
        result.errorMessage ?? "Impossibile salvare la disponibilità.",
      );
      return;
    }

    setSuccess(
      slots.length === 0
        ? "Disponibilità salvata: il docente è sempre disponibile."
        : "Disponibilità settimanale salvata.",
    );
    router.refresh();
  }

  async function handleAddTimeOff(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    setSavingOff(true);
    setError(null);
    setSuccess(null);

    let startsAt: string;
    let endsAt: string;

    if (offHasTimeRange) {
      if (!offStart || !offEnd) {
        setSavingOff(false);
        setError("Inizio e fine dell'assenza sono obbligatori.");
        return;
      }

      try {
        startsAt = romeLocalInputToUtcIso(offStart);
        endsAt = romeLocalInputToUtcIso(offEnd);
      } catch {
        setSavingOff(false);
        setError("Data o orario non validi.");
        return;
      }
    } else {
      if (!offFrom || !offTo) {
        setSavingOff(false);
        setError("Dal e al sono obbligatori.");
        return;
      }
      if (offTo < offFrom) {
        setSavingOff(false);
        setError("La data di fine deve essere successiva o uguale all'inizio.");
        return;
      }

      // Giorni interi: 00:00 Europe/Rome del primo giorno fino alla
      // mezzanotte successiva (esclusiva) dell'ultimo. getRomeDayBoundsUtc
      // gestisce CET/CEST; non usare +02:00 fisso (sbagliato in inverno).
      try {
        startsAt = getRomeDayBoundsUtc(offFrom).startUtc;
        endsAt = getRomeDayBoundsUtc(offTo).endUtc;
      } catch {
        setSavingOff(false);
        setError("Data non valida.");
        return;
      }
    }

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setSavingOff(false);
      setError("La fine dell'assenza deve essere successiva all'inizio.");
      return;
    }

    const reason = offReason.trim() || null;
    const result = await createTeacherTimeOff(supabase, memberId, {
      startsAt,
      endsAt,
      reason,
    });

    setSavingOff(false);

    if (!result.success || !result.id) {
      setError(result.errorMessage ?? "Impossibile aggiungere l'assenza.");
      return;
    }

    setTimeOff((prev) => [
      ...prev,
      { id: result.id!, startsAt, endsAt, reason },
    ]);
    setOffFrom("");
    setOffTo("");
    setOffStart("");
    setOffEnd("");
    setOffReason("");
    setSuccess("Assenza aggiunta.");
    router.refresh();
  }

  async function handleDeleteTimeOff(id: string) {
    if (readOnly) return;
    if (!window.confirm("Eliminare questa assenza?")) return;

    setDeletingOffId(id);
    setError(null);
    setSuccess(null);

    const result = await deleteTeacherTimeOff(supabase, id);
    setDeletingOffId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare l'assenza.");
      return;
    }

    setTimeOff((prev) => prev.filter((item) => item.id !== id));
    setSuccess("Assenza eliminata.");
    router.refresh();
  }

  return (
    <section className="space-y-8">
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

      <form onSubmit={(e) => void handleSaveWeekly(e)} className="space-y-6">
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--brand)]">
              Disponibilità settimanale
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Nessuna fascia = sempre disponibile. Aggiungendo fasce, il docente
              risulta libero solo in quelle ore.
            </p>
          </div>

          {slots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
              Nessuna fascia impostata: il docente è sempre disponibile.
            </p>
          ) : null}

          <div className="space-y-6">
            {visibleDays.map((day) => {
              const daySlots = slotsForDay(day);
              return (
                <div key={day} className="space-y-3">
                  <h4 className="text-sm font-medium text-neutral-800">
                    {DAY_LABELS[day]}
                  </h4>

                  {daySlots.length === 0 ? (
                    <p className="text-sm text-neutral-500">Nessuna fascia.</p>
                  ) : (
                    <ul className="space-y-3">
                      {daySlots.map((slot) => (
                        <li
                          key={slot.key}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <Field label="Dalle">
                            <input
                              type="time"
                              step={TIME_STEP_SECONDS}
                              min={gridMin}
                              max={gridMax}
                              value={minutesToTimeLabel(slot.startMinute)}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateSlot(slot.key, {
                                  startMinute: timeLabelToMinutes(
                                    e.target.value,
                                  ),
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Alle">
                            <input
                              type="time"
                              step={TIME_STEP_SECONDS}
                              min={gridMin}
                              max={gridMax}
                              value={minutesToTimeLabel(slot.endMinute)}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateSlot(slot.key, {
                                  endMinute: timeLabelToMinutes(e.target.value),
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          {readOnly ? null : (
                            <button
                              type="button"
                              onClick={() => removeSlot(slot.key)}
                              aria-label={`Elimina fascia di ${DAY_LABELS[day]}`}
                              className="mb-0.5 rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => addSlot(day)}
                      className="text-sm font-medium text-[var(--brand)] hover:underline"
                    >
                      + Fascia
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {readOnly ? null : (
          <button
            type="submit"
            disabled={savingWeekly || savingOff}
            className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {savingWeekly ? "Salvataggio…" : "Salva disponibilità"}
          </button>
        )}
      </form>

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-[var(--brand)]">
          Ferie e assenze
        </h3>

        {timeOff.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
            Nessuna ferie o assenza registrata.
          </p>
        ) : (
          <div className="space-y-5">
            <TimeOffList
              title="In programma"
              items={upcoming}
              emptyText="Nessuna assenza in programma."
              readOnly={readOnly}
              deletingId={deletingOffId}
              onDelete={handleDeleteTimeOff}
            />
            <TimeOffList
              title="Passate"
              items={past}
              emptyText="Nessuna assenza passata."
              readOnly={readOnly}
              deletingId={deletingOffId}
              onDelete={handleDeleteTimeOff}
            />
          </div>
        )}

        {readOnly ? null : (
          <form
            onSubmit={(e) => void handleAddTimeOff(e)}
            className="space-y-4 border-t border-neutral-100 pt-4"
          >
            <h4 className="text-sm font-medium text-neutral-800">
              Aggiungi assenza
            </h4>
            <ToggleRow
              label="Fascia oraria"
              checked={offHasTimeRange}
              onChange={setOffHasTimeRange}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {offHasTimeRange ? (
                <>
                  <Field label="Inizio">
                    <input
                      type="datetime-local"
                      step={TIME_STEP_SECONDS}
                      value={offStart}
                      onChange={(e) => setOffStart(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Fine">
                    <input
                      type="datetime-local"
                      step={TIME_STEP_SECONDS}
                      value={offEnd}
                      onChange={(e) => setOffEnd(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Dal">
                    <input
                      type="date"
                      value={offFrom}
                      onChange={(e) => setOffFrom(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Al">
                    <input
                      type="date"
                      value={offTo}
                      onChange={(e) => setOffTo(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </>
              )}
              <Field label="Motivo (facoltativo)" className="sm:col-span-2">
                <input
                  type="text"
                  value={offReason}
                  onChange={(e) => setOffReason(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={savingOff || savingWeekly}
              className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {savingOff ? "Salvataggio…" : "Aggiungi"}
            </button>
          </form>
        )}
      </section>
    </section>
  );
}

function TimeOffList({
  title,
  items,
  emptyText,
  readOnly,
  deletingId,
  onDelete,
}: {
  title: string;
  items: TeacherTimeOffProp[];
  emptyText: string;
  readOnly: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-neutral-800">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2"
            >
              <div>
                <p className="text-sm text-neutral-800">
                  {formatTimeOffRange(item.startsAt, item.endsAt)}
                </p>
                {item.reason ? (
                  <p className="mt-0.5 text-sm text-neutral-500">{item.reason}</p>
                ) : null}
              </div>
              {readOnly ? null : (
                <button
                  type="button"
                  disabled={deletingId === item.id}
                  onClick={() => onDelete(item.id)}
                  aria-label="Elimina assenza"
                  className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === item.id ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <TrashIcon />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
    <label className={`block min-w-[8rem] ${className}`}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8.75 3a.75.75 0 0 0-.75.75V5H5.5a.75.75 0 0 0 0 1.5h.34l.53 8.48A2.25 2.25 0 0 0 8.61 16.5h2.78a2.25 2.25 0 0 0 2.24-1.52l.53-8.48h.34a.75.75 0 0 0 0-1.5H12V3.75A.75.75 0 0 0 11.25 3h-2.5Zm1.5 2V4.5h1V5h-1ZM8 7.25a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0V8A.75.75 0 0 1 8 7.25Zm4.75.75a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0V8Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
