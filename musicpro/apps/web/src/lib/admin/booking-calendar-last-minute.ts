import type { SupabaseClient } from "@supabase/supabase-js";

import {
  enrichAvailabilitySlots,
  getActiveCampaignsForRoomDate,
  getRomeMinutesFromMidnight,
  getRoomAvailability,
  type Database,
} from "@musicpro/database";

export type BookingCalendarLastMinuteMarker = {
  date: string;
  startMinute: number;
  durationMinutes: number;
  phase: 1 | 2;
  finalPriceEur?: number;
  basePriceEur?: number;
};

type Client = SupabaseClient<Database>;

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function eachIsoDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor < to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

async function markersForRoomDate(
  client: Client,
  roomId: string,
  date: string,
  now: Date,
): Promise<BookingCalendarLastMinuteMarker[]> {
  const [availability, campaigns] = await Promise.all([
    getRoomAvailability(client, roomId, date, undefined, {
      prefetchNeighbors: false,
    }),
    getActiveCampaignsForRoomDate(client, roomId, date),
  ]);

  if (!campaigns.length) return [];

  const slots = enrichAvailabilitySlots(
    availability.slots,
    campaigns,
    true,
    now,
  );

  const markers: BookingCalendarLastMinuteMarker[] = [];
  for (const slot of slots) {
    if (!slot.lastMinute) continue;
    const startMinute = getRomeMinutesFromMidnight(slot.startAt);
    const endMinute = getRomeMinutesFromMidnight(slot.endAt);
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) continue;
    const durationMinutes = endMinute - startMinute;
    if (durationMinutes <= 0) continue;

    markers.push({
      date,
      startMinute,
      durationMinutes,
      phase: slot.lastMinute.phase,
      finalPriceEur: slot.lastMinute.finalPriceEur,
      basePriceEur: slot.priceEur ?? undefined,
    });
  }
  return markers;
}

/** Slot last minute per griglia calendario admin (solo con sala selezionata). */
export async function loadBookingCalendarLastMinuteMarkers(
  client: Client,
  options: { roomId: string; from: string; to: string },
): Promise<BookingCalendarLastMinuteMarker[]> {
  const dates = eachIsoDate(options.from, options.to);
  if (!dates.length) return [];

  const now = new Date();
  const chunks = await Promise.all(
    dates.map(async (date) => {
      try {
        return await markersForRoomDate(client, options.roomId, date, now);
      } catch {
        return [];
      }
    }),
  );

  return chunks
    .flat()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startMinute - b.startMinute,
    );
}
