"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { type Room } from "@musicpro/database";

import {
  BookingCalendarDialog,
  type BookingCalendarDraft,
} from "@/components/admin/booking-calendar-dialog";

function buildCreateDraft(rooms: Room[], today: string): BookingCalendarDraft {
  const room = rooms[0];
  return {
    roomId: room?.id ?? "",
    startLocal: `${today}T10:00`,
    durationMinutes: room?.default_duration_minutes ?? 120,
  };
}

export function StaffQuickBookingAction({
  rooms,
  today,
}: {
  rooms: Room[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const draft = useMemo(() => buildCreateDraft(rooms, today), [rooms, today]);
  const disabled = rooms.length === 0;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="glass-card group relative flex min-h-[4.5rem] w-full items-start gap-2.5 p-3 text-left transition hover:border-[var(--brand)]/20 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-base">
          ➕
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--brand)] group-hover:underline group-disabled:no-underline">
            Aggiungi prenotazione
          </p>
          <p className="mt-0.5 text-xs leading-snug text-neutral-600">
            {disabled
              ? "Nessuna sala configurata"
              : "Nuova prenotazione sala al volo"}
          </p>
        </div>
      </button>

      {open && !disabled ? (
        <BookingCalendarDialog
          mode="create"
          draft={draft}
          rooms={rooms}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
