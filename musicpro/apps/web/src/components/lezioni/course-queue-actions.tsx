"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  approveCourse,
  extendCourseHold,
  rejectCourse,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const HOLD_HOURS = [24, 48, 72] as const;

const buttonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";

interface CourseQueueActionsProps {
  courseId: string;
  actorMemberId: string;
}

export function CourseQueueActions({
  courseId,
  actorMemberId,
}: CourseQueueActionsProps) {
  const router = useRouter();
  const supabase = createClient();

  const [busy, setBusy] = useState<"approve" | "reject" | "extend" | null>(
    null,
  );
  const [holdHours, setHoldHours] = useState<(typeof HOLD_HOURS)[number]>(48);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={() =>
            void run("approve", () =>
              approveCourse(supabase, courseId, actorMemberId),
            )
          }
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
            onChange={(e) =>
              setHoldHours(Number(e.target.value) as (typeof HOLD_HOURS)[number])
            }
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          >
            {HOLD_HOURS.map((hours) => (
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
