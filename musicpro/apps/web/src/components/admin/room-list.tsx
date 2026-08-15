"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatDurationLabel, type Room } from "@musicpro/database";

interface RoomListProps {
  rooms: Room[];
}

export function RoomList({ rooms }: RoomListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rooms;

    return rooms.filter(
      (room) =>
        room.name.toLowerCase().includes(term) ||
        room.slug.toLowerCase().includes(term) ||
        (room.description?.toLowerCase().includes(term) ?? false),
    );
  }, [rooms, search]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome o slug…"
          className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:max-w-sm"
        />
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        {filtered.length} sal{filtered.length === 1 ? "a" : "e"}
      </p>

      <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessuna sala trovata.
          </li>
        ) : (
          filtered.map((room) => (
            <li key={room.id}>
              <Link
                href={`/admin/sale/${room.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-sm font-semibold text-[var(--brand)]">
                  {room.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">
                    {room.name}
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {room.open_hour}:00 – {room.close_hour}:00 ·{" "}
                    {formatDurationLabel(room.default_duration_minutes)} default
                    {room.provi_da_solo_enabled ? " · PROVI DA SOLO" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-neutral-900">
                    {room.hourly_rate_eur.toFixed(2)} €/h
                  </p>
                  <p className="text-xs text-neutral-400">
                    {room.is_active ? "Attiva" : "Disattivata"}
                  </p>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
