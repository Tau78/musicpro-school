"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { placeLesson, romeLocalInputToUtcIso } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

interface PlaceLessonFormProps {
  lessonId: string;
  rooms: { id: string; name: string }[];
  requiresRoom: boolean;
  defaultRoomId: string | null;
  slotStepMinutes?: number;
  /** YYYY-MM-DD — blocca datetime-local prima di questo giorno. */
  minDate?: string;
  label?: string;
}

export function PlaceLessonForm({
  lessonId,
  rooms,
  requiresRoom,
  defaultRoomId,
  slotStepMinutes = 15,
  minDate,
  label = "Data e ora",
}: PlaceLessonFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [startsLocal, setStartsLocal] = useState("");
  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarnings([]);

    if (!startsLocal) {
      setError("Inserisci data e ora della lezione.");
      return;
    }
    if (minDate && startsLocal.slice(0, 10) < minDate) {
      setError("Il recupero non si può piazzare nel passato.");
      return;
    }
    if (requiresRoom && !roomId) {
      setError("Seleziona una sala.");
      return;
    }

    let startsAt: string;
    try {
      startsAt = romeLocalInputToUtcIso(startsLocal);
    } catch {
      setError("Data e ora della lezione non valide.");
      return;
    }

    setBusy(true);
    const result = await placeLesson(supabase, lessonId, {
      startsAt,
      roomId: requiresRoom ? roomId : null,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile piazzare la lezione.");
      if (result.warnings?.length) setWarnings(result.warnings);
      return;
    }

    if (result.warnings?.length) setWarnings(result.warnings);
    setStartsLocal("");
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          {label}
          <input
            type="datetime-local"
            value={startsLocal}
            min={minDate ? `${minDate}T00:00` : undefined}
            step={slotStepMinutes * 60}
            disabled={busy}
            onChange={(e) => setStartsLocal(e.target.value)}
            className={inputClass}
            required
          />
        </label>
        {requiresRoom ? (
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            Sala
            <select
              value={roomId}
              disabled={busy}
              onChange={(e) => setRoomId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Seleziona sala</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="pb-2 text-sm text-neutral-500">Online</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy ? "Piazzo…" : "Piazza"}
        </button>
      </div>
    </form>
  );
}
