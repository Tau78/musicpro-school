"use client";

import { useEffect, useMemo, useState } from "react";

import {
  listBookingsInRange,
  listRooms,
  todayInRome,
  type AdminBookingListItem,
  type Room,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function formatShort(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function BookingUsageReport() {
  const supabase = createClient();
  const today = todayInRome();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 31));
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<AdminBookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listRooms(supabase).then(setRooms).catch(() => setRooms([]));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listBookingsInRange(supabase, {
      from,
      to: addDays(to, 1),
      roomId: roomId || undefined,
    })
      .then((rows) => {
        if (!cancelled) setBookings(rows);
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
  }, [from, to, roomId, supabase]);

  const days = useMemo(() => {
    const list: string[] = [];
    let cursor = from;
    while (cursor < to && list.length < 62) {
      list.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return list;
  }, [from, to]);

  const byDayAndRoom = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
      }).format(new Date(booking.start_at));
      const key = `${day}:${booking.room_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [bookings]);

  const max = Math.max(
    1,
    ...days.flatMap((day) =>
      rooms.map((room) => byDayAndRoom.get(`${day}:${room.id}`) ?? 0),
    ),
  );

  const filteredRooms = roomId
    ? rooms.filter((room) => room.id === roomId)
    : rooms;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Caricamento…</p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            {bookings.length} prenotazion{bookings.length === 1 ? "e" : "i"} nel
            periodo.
          </p>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white p-4">
            <div
              className="flex items-end gap-1"
              style={{ minWidth: `${days.length * 28}px`, height: 180 }}
            >
              {days.map((day) => {
                const total = filteredRooms.reduce(
                  (sum, room) =>
                    sum + (byDayAndRoom.get(`${day}:${room.id}`) ?? 0),
                  0,
                );
                const height = Math.round((total / max) * 140);
                return (
                  <div
                    key={day}
                    className="flex w-6 flex-col items-center justify-end"
                    title={`${formatShort(day)}: ${total}`}
                  >
                    <div
                      className="w-4 rounded-t bg-[var(--brand)]"
                      style={{ height: `${Math.max(height, total > 0 ? 4 : 0)}px` }}
                    />
                    <span className="mt-1 text-[10px] text-neutral-400">
                      {formatShort(day)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <ul className="space-y-1 text-sm text-neutral-700">
            {filteredRooms.map((room) => {
              const count = bookings.filter((b) => b.room_id === room.id).length;
              return (
                <li key={room.id}>
                  <span className="font-medium">{room.name}</span>
                  {": "}
                  {count}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
