export type RoomTab = "sala" | "orari" | "dasolo" | "calendari";

export const ROOM_TABS: { id: RoomTab; label: string }[] = [
  { id: "sala", label: "Sala" },
  { id: "orari", label: "Orari" },
  { id: "dasolo", label: "Da solo" },
  { id: "calendari", label: "Calendari" },
];

export function parseRoomTab(value: string | undefined): RoomTab {
  return ROOM_TABS.some((tab) => tab.id === value)
    ? (value as RoomTab)
    : "sala";
}

export function roomSettingsHref(roomId: string, tab: RoomTab): string {
  return tab === "sala"
    ? `/admin/sale/${roomId}`
    : `/admin/sale/${roomId}?tab=${tab}`;
}
