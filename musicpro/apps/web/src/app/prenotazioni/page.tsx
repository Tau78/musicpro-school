"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  type CreateBookingResult,
  type Room,
  type TimeSlot,
  createBooking,
  formatDateItalian,
  getCurrentMember,
  getRoomAvailability,
  listRooms,
  subscribeToBookings,
  todayInRome,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export default function PrenotazioniPage() {
  const supabase = createClient();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(todayInRome());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    if (!selectedRoomId) return;

    try {
      const availability = await getRoomAvailability(
        supabase,
        selectedRoomId,
        selectedDate,
      );
      setSlots(availability.slots);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento degli slot",
      );
    }
  }, [selectedDate, selectedRoomId, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const [roomList, member] = await Promise.all([
          listRooms(supabase),
          getCurrentMember(supabase),
        ]);

        if (cancelled) return;

        setRooms(roomList);
        if (roomList.length > 0) {
          setSelectedRoomId(roomList[0].id);
        }
        setMemberId(member?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare le sale prova",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (!selectedRoomId) return;

    const unsubscribe = subscribeToBookings(supabase, selectedRoomId, () => {
      void loadAvailability();
    });

    return unsubscribe;
  }, [loadAvailability, selectedRoomId, supabase]);

  async function handleBook(slot: TimeSlot) {
    if (!memberId) {
      setError("Accedi per prenotare una sala.");
      return;
    }

    setBookingSlot(slot.startAt);
    setMessage(null);
    setError(null);

    const result: CreateBookingResult = await createBooking(supabase, {
      roomId: selectedRoomId,
      memberId,
      startAt: slot.startAt,
      endAt: slot.endAt,
    });

    setBookingSlot(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Prenotazione non riuscita.");
      return;
    }

    setMessage(
      result.status === "pending"
        ? "Prenotazione in attesa di conferma (pagamento non ancora attivo)."
        : "Prenotazione confermata!",
    );
    await loadAvailability();
  }

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              Sale prova
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Prenotazioni
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-neutral-600 underline hover:text-neutral-900"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-neutral-600">
          Scegli sala e data per prenotare uno slot. Gli aggiornamenti sono in
          tempo reale.
        </p>

        {loading && (
          <p className="mt-6 text-sm text-neutral-500">Caricamento…</p>
        )}

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {message && (
          <p className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </p>
        )}

        {!loading && rooms.length === 0 && (
          <p className="mt-6 text-sm text-neutral-500">
            Nessuna sala disponibile. Verifica i permessi o la quota associativa.
          </p>
        )}

        {rooms.length > 0 && (
          <section className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="room"
                className="block text-sm font-medium text-[var(--brand)]"
              >
                Sala
              </label>
              <select
                id="room"
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                    {room.capacity ? ` (max ${room.capacity} persone)` : ""}
                  </option>
                ))}
              </select>
              {selectedRoom?.description && (
                <p className="mt-2 text-sm text-neutral-500">
                  {selectedRoom.description}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-[var(--brand)]"
              >
                Data
              </label>
              <input
                id="date"
                type="date"
                value={selectedDate}
                min={todayInRome()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-2 text-sm capitalize text-neutral-500">
                {formatDateItalian(selectedDate)}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-[var(--brand)]">
                Slot disponibili
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => (
                  <li key={slot.startAt}>
                    <button
                      type="button"
                      disabled={!slot.available || bookingSlot === slot.startAt}
                      onClick={() => void handleBook(slot)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                        slot.available
                          ? "border-neutral-200 bg-white hover:border-[var(--brand)] hover:bg-neutral-50"
                          : "cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-400"
                      }`}
                    >
                      <span className="font-medium">{slot.label}</span>
                      <span className="mt-1 block text-xs">
                        {slot.available
                          ? "Disponibile"
                          : slot.status === "pending"
                            ? "In attesa"
                            : "Occupato"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
