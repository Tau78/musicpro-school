"use client";

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

export function RoomPickerGrid({
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomPickerGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {rooms.map((room) => {
        const visual = roomVisualFromName(room.name);
        const capacity = roomCapacityLabel(room.name, room.capacity);
        const active = room.id === selectedRoomId;
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelectRoom(room.id)}
            className={`flex flex-col items-center rounded-xl border-2 px-1.5 py-2.5 text-center transition sm:rounded-2xl sm:px-2 sm:py-3 ${
              active
                ? "border-current bg-white/90 shadow-sm"
                : "border-white/70 bg-white/50 hover:bg-white/70"
            }`}
            style={active ? { borderColor: visual.color, color: visual.color } : undefined}
          >
            <span
              className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-base text-white sm:mb-2 sm:h-9 sm:w-9 sm:rounded-xl sm:text-lg"
              style={{ backgroundColor: visual.color }}
              aria-hidden
            >
              {visual.key === "verde" ? "🍃" : visual.key === "rossa" ? "🎸" : visual.key === "arancio" ? "🔥" : "🎵"}
            </span>
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
        );
      })}
    </div>
  );
}
