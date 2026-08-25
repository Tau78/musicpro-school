"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Room } from "@musicpro/database";

import { RoomForm } from "@/components/admin/room-form";
import {
  SettingsPageHeader,
  SettingsSectionTabs,
} from "@/components/admin/settings-page-chrome";
import {
  ROOM_TABS,
  type RoomTab,
  parseRoomTab,
  roomSettingsHref,
} from "@/lib/admin/room-tabs";

type RoomSummary = Pick<Room, "id" | "name" | "is_active">;

export function RoomsSettingsWorkspace({
  rooms,
  room,
  initialTab,
}: {
  rooms: RoomSummary[];
  room: Room;
  initialTab: RoomTab;
}) {
  const [tab, setTab] = useState<RoomTab>(() => parseRoomTab(initialTab));

  useEffect(() => {
    setTab(parseRoomTab(initialTab));
  }, [initialTab, room.id]);

  function selectTab(next: RoomTab) {
    setTab(next);
    window.history.replaceState(null, "", roomSettingsHref(room.id, next));
  }

  const activeRooms = rooms.filter((item) => item.is_active);
  const closedRooms = rooms.filter((item) => !item.is_active);
  const orderedRooms = [...activeRooms, ...closedRooms];

  return (
    <div className="min-w-0">
      <SettingsPageHeader
        title="Sale"
        description="Orari, tariffe e calendario di ogni sala."
      />

      <div
        className="mb-5 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Seleziona sala"
      >
        {orderedRooms.map((item) => {
          const selected = item.id === room.id;
          return (
            <Link
              key={item.id}
              href={roomSettingsHref(item.id, tab)}
              prefetch
              scroll={false}
              role="tab"
              aria-selected={selected}
              className={
                selected
                  ? "rounded-full bg-[var(--brand)] px-3.5 py-1.5 text-sm font-medium text-white"
                  : item.is_active
                    ? "rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    : "rounded-full border border-dashed border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-400 hover:bg-neutral-50"
              }
            >
              {item.name}
              {!item.is_active ? (
                <span className="ml-1 text-xs font-normal">· chiusa</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <SettingsSectionTabs tabs={ROOM_TABS} value={tab} onChange={selectTab} />

      <div className="mt-2">
        <RoomForm room={room} tab={tab} />
      </div>
    </div>
  );
}
