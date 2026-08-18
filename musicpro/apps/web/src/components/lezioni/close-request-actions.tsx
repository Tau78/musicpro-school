"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  closeCourse,
  dismissCourseCloseRequest,
  todayInRome,
  type CourseCloseRequest,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const buttonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";

const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50";

function formatDateTimeIt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function staffActor(memberId: string) {
  return { memberId, isStaff: true, canCloseCourses: true };
}

export function CloseRequestActions({
  requests,
  actorMemberId,
}: {
  requests: CourseCloseRequest[];
  actorMemberId: string;
}): JSX.Element {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const defaultClosedOn = useMemo(() => todayInRome(), []);

  const [closedOnById, setClosedOnById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<{
    id: string;
    action: "close" | "dismiss";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  function closedOnFor(id: string): string {
    return closedOnById[id] ?? defaultClosedOn;
  }

  async function run(
    id: string,
    action: "close" | "dismiss",
    work: () => Promise<{
      success: boolean;
      errorMessage?: string;
      warnings?: string[];
    }>,
  ) {
    setBusy({ id, action });
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

  function handleClose(request: CourseCloseRequest) {
    const closedOn = closedOnFor(request.id).trim();
    if (!closedOn) {
      setError("La data di chiusura è obbligatoria.");
      return;
    }
    if (
      !window.confirm(
        `Chiudere «${request.courseName}» in data ${closedOn}? Le lezioni dopo quella data verranno cancellate.`,
      )
    ) {
      return;
    }

    void run(request.id, "close", () =>
      closeCourse(supabase, {
        courseId: request.courseId,
        closedOn,
        actor: staffActor(actorMemberId),
      }),
    );
  }

  function handleDismiss(request: CourseCloseRequest) {
    if (
      !window.confirm(
        `Scartare la richiesta di chiusura di «${request.courseName}»?`,
      )
    ) {
      return;
    }
    void run(request.id, "dismiss", () =>
      dismissCourseCloseRequest(supabase, {
        eventId: request.id,
        actor: staffActor(actorMemberId),
      }),
    );
  }

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--brand)]">
        Richieste chiusura corso
      </h3>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
          Nessuna richiesta di chiusura.
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const itemBusy = busy?.id === request.id;
            return (
              <li
                key={request.id}
                className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-neutral-900">
                    <Link
                      href={`/admin/lezioni/corsi/${request.courseId}`}
                      className="hover:underline"
                    >
                      {request.courseName}
                    </Link>
                  </p>
                  <p className="text-sm text-neutral-600">
                    {request.actorLabel} · {formatDateTimeIt(request.createdAt)}
                  </p>
                </div>
                {request.note ? (
                  <dl className="text-sm text-neutral-600">
                    <dt className="text-xs uppercase tracking-wide text-neutral-500">
                      Nota
                    </dt>
                    <dd>{request.note}</dd>
                  </dl>
                ) : null}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-neutral-600">
                    Data chiusura
                    <input
                      type="date"
                      value={closedOnFor(request.id)}
                      disabled={busy != null}
                      onChange={(e) =>
                        setClosedOnById((current) => ({
                          ...current,
                          [request.id]: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => handleClose(request)}
                    className={`${buttonClass} bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90`}
                  >
                    {itemBusy && busy?.action === "close"
                      ? "Chiudo…"
                      : "Chiudi corso"}
                  </button>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => handleDismiss(request)}
                    className={`${buttonClass} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
                  >
                    {itemBusy && busy?.action === "dismiss"
                      ? "Scarto…"
                      : "Scarta"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
