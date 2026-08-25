"use client";

import { useEffect, useState } from "react";

import {
  createRoomSpecialDay,
  deleteRoomSpecialDay,
  listRoomSpecialDays,
  minutesToTimeLabel,
  timeLabelToMinutes,
  type OpeningMode,
  type RoomSpecialDay,
} from "@musicpro/database";

import {
  FieldLabel,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

interface RoomSpecialDaysPanelProps {
  roomId: string;
  defaultOpenMinute: number;
  defaultCloseMinute: number;
}

const MODE_OPTIONS: { value: OpeningMode; label: string }[] = [
  { value: "open", label: "Aperta" },
  { value: "split", label: "Matt/Pom" },
  { value: "closed", label: "Chiusa" },
];

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function RoomSpecialDaysPanel({
  roomId,
  defaultOpenMinute,
  defaultCloseMinute,
}: RoomSpecialDaysPanelProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<RoomSpecialDay[]>([]);
  const [title, setTitle] = useState("");
  const [startsOn, setStartsOn] = useState(todayIso);
  const [endsOn, setEndsOn] = useState(todayIso);
  const [mode, setMode] = useState<OpeningMode>("closed");
  const [startTime, setStartTime] = useState(minutesToTimeLabel(defaultOpenMinute));
  const [endTime, setEndTime] = useState(
    minutesToTimeLabel(Math.min(defaultCloseMinute, 1439)),
  );
  const [morningStart, setMorningStart] = useState("11:00");
  const [morningEnd, setMorningEnd] = useState("14:00");
  const [afternoonStart, setAfternoonStart] = useState("16:00");
  const [afternoonEnd, setAfternoonEnd] = useState("00:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const list = await listRoomSpecialDays(supabase, roomId);
    setRows(list);
  }

  useEffect(() => {
    let cancelled = false;
    void listRoomSpecialDays(supabase, roomId)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare i giorni speciali.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, supabase]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createRoomSpecialDay(supabase, roomId, {
      title,
      startsOn,
      endsOn,
      mode,
      startMinute: timeLabelToMinutes(startTime),
      endMinute:
        timeLabelToMinutes(endTime) === 0 && startTime !== "00:00"
          ? 1440
          : timeLabelToMinutes(endTime),
      morningStartMinute: timeLabelToMinutes(morningStart),
      morningEndMinute: timeLabelToMinutes(morningEnd),
      afternoonStartMinute: timeLabelToMinutes(afternoonStart),
      afternoonEndMinute:
        timeLabelToMinutes(afternoonEnd) === 0 ? 1440 : timeLabelToMinutes(afternoonEnd),
    });

    setSaving(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare l'eccezione.");
      return;
    }

    setTitle("");
    await reload();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Eliminare questa eccezione?")) return;
    const result = await deleteRoomSpecialDay(supabase, id);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare.");
      return;
    }
    await reload();
  }

  return (
    <div className="space-y-4 border-t border-neutral-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--brand)]">
          Giorni speciali
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Eccezioni per date (chiusure, festivi, orari diversi). Valgono solo
          per questa sala.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>Dal</FieldLabel>
            <input
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className={settingsInputClass}
              required
            />
          </label>
          <label className="block">
            <FieldLabel>Al</FieldLabel>
            <input
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className={settingsInputClass}
              required
            />
          </label>
        </div>
        <label className="block">
          <FieldLabel>Descrizione</FieldLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Ferragosto"
            className={settingsInputClass}
          />
        </label>
        <div className="flex flex-wrap gap-3 text-sm">
          {MODE_OPTIONS.map((option) => (
            <label key={option.value} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="special-mode"
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        {mode === "open" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeSelect
              label="Dalle"
              value={startTime}
              onChange={setStartTime}
            />
            <TimeSelect label="Alle" value={endTime} onChange={setEndTime} />
          </div>
        ) : null}
        {mode === "split" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeSelect
              label="Mattina dalle"
              value={morningStart}
              onChange={setMorningStart}
            />
            <TimeSelect
              label="Mattina alle"
              value={morningEnd}
              onChange={setMorningEnd}
            />
            <TimeSelect
              label="Pomeriggio dalle"
              value={afternoonStart}
              onChange={setAfternoonStart}
            />
            <TimeSelect
              label="Pomeriggio alle"
              value={afternoonEnd}
              onChange={setAfternoonEnd}
            />
          </div>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Creazione…" : "Crea eccezione"}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Nessuna eccezione.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-neutral-900">
                  {row.title || "Eccezione"} · {modeLabel(row.mode)}
                </p>
                <p className="text-neutral-500">
                  {formatItDate(row.startsOn)} – {formatItDate(row.endsOn)}
                  {row.mode === "open"
                    ? ` · ${minutesToTimeLabel(row.startMinute)}–${minutesToTimeLabel(row.endMinute)}`
                    : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(row.id)}
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Elimina
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function modeLabel(mode: OpeningMode): string {
  if (mode === "closed") return "Chiusa";
  if (mode === "split") return "Matt/Pom";
  return "Aperta";
}

function formatItDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options: string[] = [];
  for (let minute = 0; minute < 24 * 60; minute += 30) {
    options.push(minutesToTimeLabel(minute));
  }
  if (!options.includes(value)) options.push(value);

  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={settingsInputClass}
      >
        {options.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
    </label>
  );
}
