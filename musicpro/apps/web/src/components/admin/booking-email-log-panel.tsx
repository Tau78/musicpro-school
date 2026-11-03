"use client";

import { useEffect, useState } from "react";

import {
  bookingEmailLogStatusLabel,
  listBookingEmailLog,
  summarizeMemberBookingEmail,
  type BookingEmailLogEntry,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const toneClasses = {
  ok: "border-green-200 bg-green-50 text-green-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  none: "border-neutral-200 bg-neutral-50 text-neutral-800",
} as const;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface BookingEmailLogPanelProps {
  bookingId: string;
  memberEmail?: string | null;
  /** Solo banner sintetico (dialog calendario). */
  compact?: boolean;
  /** Incrementa per ricaricare dopo un reinvio. */
  refreshKey?: number;
}

export function BookingEmailLogPanel({
  bookingId,
  memberEmail,
  compact = false,
  refreshKey = 0,
}: BookingEmailLogPanelProps) {
  const supabase = createClient();
  const [entries, setEntries] = useState<BookingEmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void listBookingEmailLog(supabase, bookingId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Log email non disponibile.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId, supabase, refreshKey]);

  const summary = summarizeMemberBookingEmail(entries, memberEmail);

  if (loading) {
    return (
      <p className="text-sm text-neutral-500">
        {compact ? "Log email…" : "Caricamento log email…"}
      </p>
    );
  }

  if (loadError) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {loadError}
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div
        className={`rounded-lg border px-3 py-2.5 text-sm ${toneClasses[summary.tone]}`}
      >
        <p className="font-medium">{summary.headline}</p>
        {summary.detail ? (
          <p className="mt-0.5 text-xs opacity-90">{summary.detail}</p>
        ) : null}
      </div>

      {!compact && entries.length > 0 ? (
        <ul className="space-y-2 text-sm text-neutral-700">
          {entries.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={
                    row.status === "sent"
                      ? "font-medium text-green-800"
                      : row.status === "failed"
                        ? "font-medium text-red-800"
                        : "font-medium text-amber-800"
                  }
                >
                  {bookingEmailLogStatusLabel(row.status)}
                </span>
                <span className="text-xs text-neutral-500">
                  {formatWhen(row.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-600">{row.subject}</p>
              <p className="text-xs text-neutral-500">{row.recipientEmail}</p>
              {row.error ? (
                <p className="mt-1 text-xs text-red-700">{row.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!compact && entries.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Nessuna riga in booking_email_log per questa prenotazione.
        </p>
      ) : null}
    </div>
  );
}
