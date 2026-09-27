"use client";

import type { Room } from "@musicpro/database";
import { formatEuro } from "@musicpro/database";

import { roomVisualFromName } from "@/lib/ui/associate-theme";

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
    <div className="grid grid-cols-3 gap-3">
      {rooms.map((room) => {
        const visual = roomVisualFromName(room.name);
        const active = room.id === selectedRoomId;
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelectRoom(room.id)}
            className={`flex flex-col items-center rounded-2xl border-2 px-2 py-4 text-center transition ${
              active
                ? "border-current bg-white/90 shadow-sm"
                : "border-white/70 bg-white/50 hover:bg-white/70"
            }`}
            style={active ? { borderColor: visual.color, color: visual.color } : undefined}
          >
            <span
              className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-lg text-white"
              style={{ backgroundColor: visual.color }}
              aria-hidden
            >
              {visual.key === "verde" ? "🍃" : visual.key === "rossa" ? "🎸" : visual.key === "arancio" ? "🔥" : "🎵"}
            </span>
            <span className="text-sm font-semibold text-[var(--brand)]">
              {room.name.replace(/^Sala\s+/i, "")}
            </span>
            {visual.tag ? (
              <span className="mt-1 text-[10px] leading-tight text-neutral-500">
                {visual.tag}
              </span>
            ) : null}
            <span className="mt-2 text-xs text-neutral-600">
              {formatEuro(room.hourly_rate_eur)}/h
            </span>
          </button>
        );
      })}
    </div>
  );
}
