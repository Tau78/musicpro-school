"use client";

import { useState } from "react";

import {
  formatBookingDateTime,
  formatEuro,
  listBookingsInRange,
  type AdminBookingListItem,
  type Room,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface CalendarExportBarProps {
  rooms: Pick<Room, "id" | "name">[];
  defaultFrom: string;
  defaultTo: string;
  defaultRoomId?: string | null;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function bookingRow(booking: AdminBookingListItem) {
  const member = booking.member
    ? `${booking.member.last_name} ${booking.member.first_name}`.trim()
    : "";
  return {
    servizio: booking.room?.name ?? "",
    quando: formatBookingDateTime(booking.start_at, booking.end_at),
    creatoDa: booking.member?.email ?? "",
    nome: member,
    prezzo: booking.total_price_eur != null ? formatEuro(booking.total_price_eur) : "",
  };
}

function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CalendarExportBar({
  rooms,
  defaultFrom,
  defaultTo,
  defaultRoomId,
}: CalendarExportBarProps) {
  const supabase = createClient();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [format, setFormat] = useState<"csv" | "html">("csv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const exclusiveTo = (() => {
        const [y, m, d] = (to < from ? from : to).split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      })();
      const bookings = await listBookingsInRange(supabase, {
        from,
        to: exclusiveTo,
        roomId: roomId || undefined,
      });
      const rows = bookings.map(bookingRow);

      if (format === "csv") {
        const header = [
          "Servizio",
          "Quando",
          "Creato da",
          "Nome e cognome",
          "Prezzo",
        ];
        const lines = [
          header.join(","),
          ...rows.map((row) =>
            [
              csvEscape(row.servizio),
              csvEscape(row.quando),
              csvEscape(row.creatoDa),
              csvEscape(row.nome),
              csvEscape(row.prezzo),
            ].join(","),
          ),
        ];
        downloadBlob(
          `prenotazioni-${from}-${to}.csv`,
          "text/csv;charset=utf-8",
          `\uFEFF${lines.join("\n")}`,
        );
      } else {
        const body = rows
          .map(
            (row) =>
              `<tr><td>${row.servizio}</td><td>${row.quando}</td><td>${row.creatoDa}</td><td>${row.nome}</td><td>${row.prezzo}</td></tr>`,
          )
          .join("");
        const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prenotazioni</title>
<style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f4f6}</style>
</head><body><h1>Prenotazioni ${from} – ${to}</h1>
<table><thead><tr><th>Servizio</th><th>Quando</th><th>Creato da</th><th>Nome</th><th>Prezzo</th></tr></thead>
<tbody>${body}</tbody></table></body></html>`;
        downloadBlob(
          `prenotazioni-${from}-${to}.html`,
          "text/html;charset=utf-8",
          html,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-800">Scarica il calendario</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Da</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Fino a</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Sala</span>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Tutte</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Formato</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "csv" | "html")}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="csv">CSV</option>
            <option value="html">HTML stampabile</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDownload()}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy ? "Preparazione…" : "Scarica"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
