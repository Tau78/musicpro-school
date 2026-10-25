import {
  type Database,
  getRoomAvailability,
} from "@musicpro/database";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Allineato a `LAST_MINUTE_PHASE1_HOURS` in @musicpro/database. */
const LAST_MINUTE_WINDOW_HOURS = 48;

export const LAST_MINUTE_IG_DIGEST_SETTING_KEY = "last_minute_ig_digest";

export const DIGEST_ROOM_ORDER = ["Rossa", "Verde", "Arancio"] as const;
export type DigestRoomName = (typeof DIGEST_ROOM_ORDER)[number];

export const ROOM_ACCENT_HEX: Record<DigestRoomName, string> = {
  Rossa: "#B23B3E",
  Verde: "#38764B",
  Arancio: "#D2762A",
};

export interface DigestSlotRow {
  campaignId: string;
  roomId: string;
  roomName: DigestRoomName;
  startAt: string;
  endAt: string;
  phase: "phase1" | "phase2";
}

export interface DigestDayBundle {
  dayRome: string;
  slots: DigestSlotRow[];
  hash: string;
}

export interface LastMinuteIgDigestDayState {
  hash: string;
  queuedAt: string;
  planId?: string;
  slotId?: string;
}

export interface LastMinuteIgDigestSetting {
  days: Record<string, LastMinuteIgDigestDayState>;
}

type SchoolClient = SupabaseClient<Database>;

function normalizeDigestRoomName(raw: string): DigestRoomName | null {
  const name = raw.trim();
  for (const room of DIGEST_ROOM_ORDER) {
    if (name === room) return room;
  }
  return null;
}

export function romeDayFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function romeHourToken(iso: string, endOfSlot: boolean): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (endOfSlot && hour === 0 && minute === 0) return "24";
  if (minute === 0) return String(hour).padStart(2, "0");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 20–22, come compose-last-minute-story.py — niente 20.00 it-IT. */
export function formatDigestFascia(startAt: string, endAt: string): string {
  return `${romeHourToken(startAt, false)}–${romeHourToken(endAt, true)}`;
}

const ITALIAN_MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/** LUNEDÌ 26 OTTOBRE — allineato a compose-last-minute-story.py */
export function formatDigestDateLabel(dayRome: string): string {
  const [y, m, d] = dayRome.split("-").map(Number);
  if (!y || !m || !d) return dayRome.toUpperCase();
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
  }).format(utcNoon);
  const month = ITALIAN_MONTHS[m - 1] ?? "";
  return `${weekday} ${d} ${month}`.toLocaleUpperCase("it-IT");
}

export function digestSlotsFingerprint(slots: DigestSlotRow[]): string {
  const lines = slots
    .map((s) => `${s.roomName}|${s.startAt}|${s.endAt}|${s.phase}`)
    .sort();
  const payload = lines.join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

function groupSlotsByDay(slots: DigestSlotRow[]): Map<string, DigestSlotRow[]> {
  const map = new Map<string, DigestSlotRow[]>();
  for (const slot of slots) {
    const day = romeDayFromIso(slot.startAt);
    const list = map.get(day) ?? [];
    list.push(slot);
    map.set(day, list);
  }
  return map;
}

function sortSlots(slots: DigestSlotRow[]): DigestSlotRow[] {
  return [...slots].sort((a, b) => {
    const roomOrder =
      DIGEST_ROOM_ORDER.indexOf(a.roomName) - DIGEST_ROOM_ORDER.indexOf(b.roomName);
    if (roomOrder !== 0) return roomOrder;
    return a.startAt.localeCompare(b.startAt);
  });
}

async function slotStillAvailable(
  service: SchoolClient,
  roomId: string,
  startAt: string,
  endAt: string,
  durationMinutes: number,
): Promise<boolean> {
  const dayRome = romeDayFromIso(startAt);
  try {
    const availability = await getRoomAvailability(
      service,
      roomId,
      dayRome,
      durationMinutes,
      { prefetchNeighbors: false },
    );
    return availability.slots.some(
      (s) => s.available && s.startAt === startAt && s.endAt === endAt,
    );
  } catch {
    return true;
  }
}

export function parseLastMinuteIgDigestSetting(
  raw: string | null,
): LastMinuteIgDigestSetting {
  if (!raw?.trim()) return { days: {} };
  try {
    const parsed = JSON.parse(raw) as LastMinuteIgDigestSetting;
    if (!parsed || typeof parsed !== "object" || !parsed.days) {
      return { days: {} };
    }
    return { days: parsed.days ?? {} };
  } catch {
    return { days: {} };
  }
}

export async function loadLastMinuteDigestDays(
  service: SchoolClient,
  now = new Date(),
  options?: { verifyAvailability?: boolean },
): Promise<DigestDayBundle[]> {
  const verifyAvailability = options?.verifyAvailability !== false;
  const horizonMs = now.getTime() + LAST_MINUTE_WINDOW_HOURS * 60 * 60 * 1000;
  const nowIso = now.toISOString();
  const horizonIso = new Date(horizonMs).toISOString();

  const { data: campaigns, error } = await service
    .from("last_minute_campaigns")
    .select("id, room_id, start_at, end_at, phase")
    .in("phase", ["phase1", "phase2"])
    .gt("start_at", nowIso)
    .lte("start_at", horizonIso);

  if (error) {
    if (/last_minute_campaigns|schema cache|does not exist|Could not find|PGRST205/i.test(
      error.message,
    )) {
      return [];
    }
    throw new Error(error.message);
  }

  const roomIds = [
    ...new Set((campaigns ?? []).map((c) => c.room_id as string)),
  ];
  const roomById = new Map<
    string,
    { name: string; default_duration_minutes: number | null }
  >();

  if (roomIds.length > 0) {
    const { data: rooms, error: roomsError } = await service
      .from("rooms")
      .select("id, name, default_duration_minutes")
      .in("id", roomIds);

    if (roomsError) {
      throw new Error(roomsError.message);
    }

    for (const room of rooms ?? []) {
      roomById.set(room.id as string, {
        name: String(room.name ?? ""),
        default_duration_minutes:
          typeof room.default_duration_minutes === "number"
            ? room.default_duration_minutes
            : null,
      });
    }
  }

  const rows: DigestSlotRow[] = [];

  for (const row of campaigns ?? []) {
    const roomMeta = roomById.get(row.room_id as string);
    const roomName = roomMeta ? normalizeDigestRoomName(roomMeta.name) : null;
    if (!roomName) continue;

    const startAt = row.start_at as string;
    const endAt = row.end_at as string;
    const phase = row.phase as "phase1" | "phase2";
    const roomId = row.room_id as string;
    const durationMinutes = Math.max(
      30,
      Math.round(
        (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
      ),
    );

    if (verifyAvailability) {
      const ok = await slotStillAvailable(
        service,
        roomId,
        startAt,
        endAt,
        durationMinutes,
      );
      if (!ok) continue;
    }

    rows.push({
      campaignId: row.id as string,
      roomId,
      roomName,
      startAt,
      endAt,
      phase,
    });
  }

  const byDay = groupSlotsByDay(rows);
  const bundles: DigestDayBundle[] = [];

  for (const [dayRome, daySlots] of byDay) {
    const sorted = sortSlots(daySlots);
    if (sorted.length === 0) continue;
    bundles.push({
      dayRome,
      slots: sorted,
      hash: digestSlotsFingerprint(sorted),
    });
  }

  bundles.sort((a, b) => a.dayRome.localeCompare(b.dayRome));
  return bundles;
}

export function digestDayColumns(
  slots: DigestSlotRow[],
): Record<DigestRoomName, string[]> {
  const out: Record<DigestRoomName, string[]> = {
    Rossa: [],
    Verde: [],
    Arancio: [],
  };
  for (const slot of slots) {
    out[slot.roomName].push(formatDigestFascia(slot.startAt, slot.endAt));
  }
  return out;
}

