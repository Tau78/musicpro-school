"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type BookingWithRoom,
  type BookingSettings,
  type TimeSlot,
  fetchRoomAvailability,
  formatDateItalian,
  formatDurationLabel,
  modifyBooking,
  todayInRome,
  utcIsoToRomeLocalInput,
} from "@musicpro/database";
import { mapUserFacingError } from "@musicpro/shared";

import { createClient } from "@/lib/supabase/client";

type BookingModifyPanelProps = {
  booking: BookingWithRoom;
  settings: BookingSettings;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onCalendarSync: (bookingId: string) => void;
};

export function BookingModifyPanel({
  booking,
  settings,
  onSuccess,
  onError,
  onCalendarSync,
}: BookingModifyPanelProps) {
  const supabase = createClient();
  const durationMinutes = booking.duration_minutes ?? 120;

  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() =>
    utcIsoToRomeLocalInput(booking.start_at).slice(0, 10),
  );
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const bookableSlots = useMemo(
    () => slots.filter((slot) => slot.available),
    [slots],
  );

  const loadSlots = useCallback(async () => {
    if (!booking.room_id || !selectedDate) return;

    setLoadingSlots(true);
    setSelectedSlot(null);

    try {
      const availability = await fetchRoomAvailability(
        booking.room_id,
        selectedDate,
        durationMinutes,
        { excludeBookingId: booking.id },
      );
      setSlots(availability.slots);
    } catch (err) {
      onError(
        mapUserFacingError(
          err instanceof Error ? err.message : "",
          "Impossibile caricare gli slot disponibili.",
        ),
      );
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [booking.id, booking.room_id, durationMinutes, onError, selectedDate]);

  useEffect(() => {
    if (!open) return;
    void loadSlots();
  }, [loadSlots, open]);

  function handleClose() {
    setOpen(false);
    setSelectedSlot(null);
  }

  async function handleConfirm() {
    if (!selectedSlot) {
      onError("Seleziona un nuovo orario.");
      return;
    }

    setSubmitting(true);

    const result = await modifyBooking(supabase, booking.id, {
      startAt: selectedSlot.startAt,
      endAt: selectedSlot.endAt,
      durationMinutes,
    });

    setSubmitting(false);

    if (!result.success) {
      onError(result.errorMessage ?? "Spostamento non riuscito.");
      return;
    }

    handleClose();
    onCalendarSync(booking.id);
    onSuccess("Prenotazione spostata al nuovo orario.");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-[var(--brand)] underline"
      >
        Sposta orario
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`modify-date-${booking.id}`} className="text-xs text-neutral-600">
          Nuova data
        </label>
        <input
          id={`modify-date-${booking.id}`}
          type="date"
          value={selectedDate}
          min={todayInRome()}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
        />
        <span className="text-xs text-neutral-500">
          {formatDurationLabel(durationMinutes)} · entro {settings.modifyMinHours}h
        </span>
        <button
          type="button"
          onClick={handleClose}
          className="ml-auto text-xs text-neutral-500 underline"
        >
          Annulla
        </button>
      </div>

      <p className="mt-2 text-xs capitalize text-neutral-500">
        {formatDateItalian(selectedDate)}
      </p>

      {loadingSlots ? (
        <p className="mt-2 text-xs text-neutral-500">Caricamento slot…</p>
      ) : bookableSlots.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-600">
          Nessuno slot libero per questa data.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {bookableSlots.map((slot) => {
            const selected = selectedSlot?.startAt === slot.startAt;
            return (
              <li key={slot.startAt}>
                <button
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded border px-2 py-1 text-xs ${
                    selected
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-[var(--brand)]"
                  }`}
                >
                  {slot.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!selectedSlot || submitting}
          onClick={() => void handleConfirm()}
          className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Spostamento…" : "Conferma spostamento"}
        </button>
      </div>
    </div>
  );
}
