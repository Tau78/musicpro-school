"use client";

import { useEffect, useState } from "react";

import type { Room } from "@musicpro/database";
import { formatEuro } from "@musicpro/database";

import {
  roomCapacityLabel,
  roomVisualFromName,
} from "@/lib/ui/associate-theme";

type RoomPickerGridProps = {
  rooms: Room[];
  selectedRoomId: string;
  onSelectRoom: (roomId: string) => void;
};

const ROOM_PHOTOS = {
  rossa: "https://www.musicproeventi.it/img/sale.jpg",
  verde: "https://www.musicproeventi.it/img/sede-2.jpg",
  arancio: "https://www.musicproeventi.it/img/vintage.jpg",
  default: "https://www.musicproeventi.it/img/sale.jpg",
} as const;

export function RoomPickerGrid({
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomPickerGridProps) {
  const [openPhoto, setOpenPhoto] = useState<{
    src: string;
    roomName: string;
  } | null>(null);

  useEffect(() => {
    if (!openPhoto) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPhoto(null);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [openPhoto]);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {rooms.map((room) => {
          const visual = roomVisualFromName(room.name);
          const capacity = roomCapacityLabel(room.name, room.capacity);
          const active = room.id === selectedRoomId;
          const photo =
            ROOM_PHOTOS[visual.key as keyof typeof ROOM_PHOTOS] ??
            ROOM_PHOTOS.default;

          return (
            <div
              key={room.id}
              className={`overflow-hidden rounded-xl border-2 text-center sm:rounded-2xl ${
                active
                  ? "bg-white/90 shadow-sm"
                  : "border-white/70 bg-white/50 hover:bg-white/70"
              }`}
              style={active ? { borderColor: visual.color } : undefined}
            >
              <button
                type="button"
                onClick={() => setOpenPhoto({ src: photo, roomName: room.name })}
                className="group relative block aspect-[4/3] w-full touch-manipulation overflow-hidden bg-neutral-100"
                aria-label={`Apri la foto di ${room.name} a schermo intero`}
              >
                <img
                  src={photo}
                  alt={room.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
                <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium text-white">
                  Ingrandisci
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="flex w-full touch-manipulation flex-col items-center px-1.5 py-2 text-center sm:px-2 sm:py-2.5"
                aria-pressed={active}
              >
                <span className="text-xs font-semibold text-[var(--brand)] sm:text-sm">
                  {room.name.replace(/^Sala\s+/i, "")}
                </span>
                {capacity ? (
                  <span className="mt-0.5 text-[10px] leading-tight text-neutral-500">
                    {capacity}
                  </span>
                ) : null}
                <span className="mt-1 text-[11px] text-neutral-600 sm:text-xs">
                  {formatEuro(room.hourly_rate_eur)}/h
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {openPhoto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto di ${openPhoto.roomName}`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setOpenPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setOpenPhoto(null)}
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/25"
            aria-label="Chiudi foto"
          >
            Chiudi
          </button>
          <img
            src={openPhoto.src}
            alt={openPhoto.roomName}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
