/** Palette colori evento Google Calendar (colorId 1–11). */
export const GOOGLE_EVENT_COLOR_STYLES: Record<
  string,
  { bg: string; border: string }
> = {
  "1": { bg: "#e8eaf6", border: "#7986cb" },
  "2": { bg: "#e6f4ea", border: "#33b679" },
  "3": { bg: "#f3e5f5", border: "#8e24aa" },
  "4": { bg: "#fdecea", border: "#e67c73" },
  "5": { bg: "#fff8e1", border: "#f6bf26" },
  "6": { bg: "#fbe9e7", border: "#f4511e" },
  "7": { bg: "#e1f5fe", border: "#039be5" },
  "8": { bg: "#eceff1", border: "#616161" },
  "9": { bg: "#e8eaf6", border: "#3f51b5" },
  "10": { bg: "#e8f5e9", border: "#0b8043" },
  "11": { bg: "#ffebee", border: "#d50000" },
};

export function googleEventColorStyle(
  colorId: string | null | undefined,
): { bg: string; border: string } | null {
  const key = colorId?.trim();
  if (!key) return null;
  return GOOGLE_EVENT_COLOR_STYLES[key] ?? null;
}

export type RoomColorMatch = {
  id: string;
  name: string;
  googleCalendarColorId: string | null;
};

/** Abbina il titolo evento alla sala (es. «Rossa 1h — Mario»). */
export function matchRoomFromEventSummary(
  summary: string | null | undefined,
  rooms: RoomColorMatch[],
): RoomColorMatch | null {
  const normalized = (summary ?? "").trim().toUpperCase();
  if (!normalized || rooms.length === 0) return null;

  const sorted = [...rooms].sort((a, b) => b.name.length - a.name.length);
  for (const room of sorted) {
    const name = room.name.trim().toUpperCase();
    if (!name) continue;
    if (
      normalized === name ||
      normalized.startsWith(`${name} `) ||
      normalized.startsWith(`${name}-`) ||
      normalized.startsWith(`${name} —`)
    ) {
      return room;
    }
  }
  return null;
}
