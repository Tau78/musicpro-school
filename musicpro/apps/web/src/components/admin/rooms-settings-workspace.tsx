"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Room } from "@musicpro/database";

import { RoomForm } from "@/components/admin/room-form";
import { SettingsTabs } from "@/components/admin/settings-chrome";
import {
  ROOM_TABS,
  type RoomTab,
  parseRoomTab,
  roomSettingsHref,
} from "@/lib/admin/room-tabs";

export function RoomsSettingsWorkspace({
  room,
  initialTab,
}: {
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

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-3xl font-semibold text-[var(--brand)]">
          {room.name}
        </h2>
        <SettingsTabs tabs={ROOM_TABS} value={tab} onChange={selectTab} />
      </div>

      <div className="mt-4">
        <RoomForm room={room} tab={tab} />
      </div>
    </div>
  );
}
