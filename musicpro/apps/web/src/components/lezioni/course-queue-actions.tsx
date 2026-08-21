"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  approveCourse,
  extendCourseHold,
  minutesToTimeLabel,
  rejectCourse,
  type IsoWeekday,
} from "@musicpro/database";

import { WEEKDAY_LABELS } from "@/components/lezioni/course-labels";
import { createClient } from "@/lib/supabase/client";

const HOLD_HOURS = [24, 48, 72] as const;
const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

const buttonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";

const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50";

interface CourseQueueActionsProps {
  courseId: string;
  actorMemberId: string;
  weeklyDow: IsoWeekday;
  weeklyStartMinute: number;
  roomId: string | null;
  rooms: { id: string; name: string }[];
  online: boolean;
  slotStepMinutes?: number;
  defaultHoldHours?: number;
}

function isIsoWeekday(value: number): value is IsoWeekday {
  return WEEKDAYS.includes(value as IsoWeekday);
}

function buildStartMinutes(step: number, includeMinute: number): number[] {
  const minutes: number[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    minutes.push(m);
  }
  if (!minutes.includes(includeMinute)) {
    minutes.push(includeMinute);
    minutes.sort((a, b) => a - b);
  }
  return minutes;
}

export function CourseQueueActions({
  courseId,
  actorMemberId,
  weeklyDow,
  weeklyStartMinute,
  roomId,
  rooms,
  online,
  slotStepMinutes = 15,
  defaultHoldHours = 48,
}: CourseQueueActionsProps) {
  const router = useRouter();
  const supabase = createClient();

  const holdHourOptions = useMemo(() => {
    const hours = new Set<number>(HOLD_HOURS);
    if (defaultHoldHours > 0) hours.add(defaultHoldHours);
    return [...hours].sort((a, b) => a - b);
  }, [defaultHoldHours]);

  const [busy, setBusy] = useState<"approve" | "reject" | "extend" | null>(
    null,
  );
  const [holdHours, setHoldHours] = useState(defaultHoldHours);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dow, setDow] = useState<IsoWeekday>(weeklyDow);
  const [startMinute, setStartMinute] = useState(weeklyStartMinute);
  const [selectedRoomId, setSelectedRoomId] = useState(roomId ?? "");

  const startMinutes = useMemo(
    () => buildStartMinutes(slotStepMinutes, weeklyStartMinute),
    [slotStepMinutes, weeklyStartMinute],
  );

  async function run(
    action: "approve" | "reject" | "extend",
    work: () => Promise<{
      success: boolean;
      errorMessage?: string;
      warnings?: string[];
    }>,
  ) {
    setBusy(action);
    setError(null);
    setWarnings([]);

    const result = await work();
    setBusy(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Operazione non riuscita.");
      if (result.warnings?.length) setWarnings(result.warnings);
      return;
    }

    if (result.warnings?.length) setWarnings(result.warnings);
    router.refresh();
  }

  function handleApprove() {
    if (!online && !selectedRoomId) {
      setError("Seleziona una sala.");
      return;
    }

    void run("approve", () =>
      approveCourse(supabase, courseId, actorMemberId, {
        roomId: online ? null : selectedRoomId,
        weeklyDow: dow,
        weeklyStartMinute: startMinute,
      }),
    );
  }

  return (
    <div className="space-y-2">
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
          Giorno
          <select
            value={dow}
            disabled={busy != null}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (isIsoWeekday(next)) setDow(next);
            }}
            className={inputClass}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {WEEKDAY_LABELS[day]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Orario
          <select
            value={startMinute}
            disabled={busy != null}
            onChange={(e) => setStartMinute(Number(e.target.value))}
            className={inputClass}
          >
            {startMinutes.map((minute) => (
              <option key={minute} value={minute}>
                {minutesToTimeLabel(minute)}
              </option>
            ))}
          </select>
        </label>
        {online ? (
          <p className="pb-2 text-sm text-neutral-500">Online — nessuna sala</p>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            Sala
            <select
              value={selectedRoomId}
              disabled={busy != null}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className={inputClass}
            >
              <option value="">Seleziona sala</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={handleApprove}
          className={`${buttonClass} bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90`}
        >
          {busy === "approve" ? "Approvo…" : "Approva"}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() =>
            void run("reject", () =>
              rejectCourse(supabase, courseId, actorMemberId),
            )
          }
          className={`${buttonClass} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
        >
          {busy === "reject" ? "Rifiuto…" : "Rifiuta"}
        </button>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <span className="sr-only">Ore di prolungamento hold</span>
          <select
            value={holdHours}
            disabled={busy != null}
            onChange={(e) => setHoldHours(Number(e.target.value))}
            className={inputClass}
          >
            {holdHourOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours}h
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy != null}
          onClick={() =>
            void run("extend", () =>
              extendCourseHold(supabase, courseId, holdHours),
            )
          }
          className={`${buttonClass} border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`}
        >
          {busy === "extend" ? "Prolungo…" : "Prolunga hold"}
        </button>
      </div>
    </div>
  );
}
