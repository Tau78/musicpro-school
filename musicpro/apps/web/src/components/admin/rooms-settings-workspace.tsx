"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Room } from "@musicpro/database";

import {
  ROOM_TABS,
  RoomForm,
  type RoomTab,
} from "@/components/admin/room-form";

export function parseRoomTab(value: string | undefined): RoomTab {
  return ROOM_TABS.some((tab) => tab.id === value)
    ? (value as RoomTab)
    : "sala";
}

function roomHref(roomId: string, tab: RoomTab): string {
  return tab === "sala"
    ? `/admin/sale/${roomId}`
    : `/admin/sale/${roomId}?tab=${tab}`;
}

export function RoomsSettingsWorkspace({
  rooms,
  room,
  initialTab,
}: {
  rooms: Pick<Room, "id" | "name" | "is_active">[];
  room: Room;
  initialTab: RoomTab;
}) {
  const router = useRouter();
  const tab = parseRoomTab(initialTab);

  function setTab(next: RoomTab) {
    router.replace(roomHref(room.id, next), { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav className="md:w-44 md:shrink-0" aria-label="Sale">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Sale
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5 md:flex-col md:flex-nowrap">
          {rooms.map((item) => {
            const selected = item.id === room.id;
            return (
              <li key={item.id}>
                <Link
                  href={roomHref(item.id, tab)}
                  className={
                    selected
                      ? "block rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white"
                      : "block rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                  }
                >
                  {item.name}
                  {!item.is_active ? (
                    <span className="ml-1 text-xs font-normal opacity-80">
                      chiusa
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Scheda
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5 md:flex-col md:flex-nowrap">
          {ROOM_TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={
                    selected
                      ? "w-full rounded-lg bg-[var(--brand)] px-3 py-1.5 text-left text-sm font-medium text-white"
                      : "w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                  }
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        <h2 className="mb-4 text-3xl font-semibold text-[var(--brand)]">
          {room.name}
        </h2>
        <RoomForm key={room.id} room={room} tab={tab} />
      </div>
    </div>
  );
}
