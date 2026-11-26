"use client";

import { useEffect, useMemo, useState } from "react";

import {
  listLastMinuteAttributedBookings,
  todayInRome,
  type LastMinuteSaleRow,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function formatRomeDateTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatEuro(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function LastMinuteSalesReport() {
  const supabase = createClient();
  const today = todayInRome();
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<LastMinuteSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listLastMinuteAttributedBookings(supabase, { from, to })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Caricamento fallito.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, supabase]);

  const totalRevenue = useMemo(
    () =>
      rows.reduce((sum, row) => sum + (row.total_price_eur ?? 0), 0),
    [rows],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Prenotazioni collegate a una campagna last minute attiva (fase 1 o 2)
        al momento della creazione. Report da migration 136 — nessun dato
        storico prima del deploy.
      </p>

      <div className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-0.5 text-xs text-neutral-600">
          Da
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-w-0 max-w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5 text-xs text-neutral-600">
          A
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-w-0 max-w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          />
        </label>
        <span className="text-sm font-medium text-neutral-800">
          {rows.length} prenotazioni · {formatEuro(totalRevenue)}
        </span>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-sm text-neutral-500">Caricamento…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Nessuna vendita nel periodo.</p>
      ) : (
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-600">
                <th className="py-1 pr-2 font-medium">Creata</th>
                <th className="py-1 pr-2 font-medium">Slot</th>
                <th className="py-1 pr-2 font-medium">Sala</th>
                <th className="py-1 pr-2 font-medium">Socio</th>
                <th className="py-1 pr-2 font-medium">Fase</th>
                <th className="py-1 font-medium text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {formatRomeDateTime(row.created_at)}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {formatRomeDateTime(row.start_at)}
                  </td>
                  <td className="py-1.5 pr-2">{row.room_name}</td>
                  <td className="min-w-0 max-w-[8rem] truncate py-1.5 pr-2">
                    {row.member_label}
                  </td>
                  <td className="py-1.5 pr-2">{row.campaign_phase ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatEuro(row.total_price_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}