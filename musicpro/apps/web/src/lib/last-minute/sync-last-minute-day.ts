import {
  type Database,
  getOperationalWeekSchedule,
  getRoomAvailability,
  hoursUntilSlotStart,
  isLastMinuteAnchorSlot,
  isLastMinuteDayEnabled,
  isSlotOpenForLastMinute,
  LAST_MINUTE_PHASE2_HOURS,
} from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import { romeDayFromIso } from "@/lib/last-minute-digest-story";
import { isEveningOperationalForDay } from "@/lib/last-minute/evening-operational";
import {
  publishSchoolLastMinuteDigestStories,
  type PublishDigestStoriesResult,
} from "@/lib/queue-school-lm-story-to-eventi";

export type LastMinuteDaySyncProgress = {
  dayRome: string;
  dayEnabled: boolean;
  operationalActive: boolean;
  roomsScanned: number;
  candidates: number;
  phase1Created: number;
  phase2Advanced: number;
  campaignsCancelled?: number;
  digest?: PublishDigestStoriesResult;
  skipped?: boolean;
  reason?: string;
};

type SchoolClient = SupabaseClient<Database>;

function isMissingLastMinuteSchema(message: string): boolean {
  return /last_minute_campaigns|schema cache|does not exist|Could not find|PGRST205/i.test(
    message,
  );
}

async function slotInOperationalBand(
  service: SchoolClient,
  startAt: string,
  dayRome: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("booking_start_in_operational_band", {
    p_start_at: startAt,
    p_day: dayRome,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export type SyncLastMinuteDayOptions = {
  /** Accoda/aggiorna digest storie (default true su hook conferma). */
  runDigest?: boolean;
  /** Annulla campagne attive se la sera non è operativa (default false su hook). */
  cancelIfNotOperational?: boolean;
  now?: Date;
};

export async function syncLastMinuteForDay(
  service: SchoolClient,
  dayRome: string,
  options?: SyncLastMinuteDayOptions,
): Promise<LastMinuteDaySyncProgress> {
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();
  const runDigest = options?.runDigest !== false;
  const cancelIfNotOperational = options?.cancelIfNotOperational === true;

  const progress: LastMinuteDaySyncProgress = {
    dayRome,
    dayEnabled: false,
    operationalActive: false,
    roomsScanned: 0,
    candidates: 0,
    phase1Created: 0,
    phase2Advanced: 0,
  };

  const operationalSchedule = await getOperationalWeekSchedule(service);
  progress.dayEnabled = isLastMinuteDayEnabled(operationalSchedule, dayRome);

  if (!progress.dayEnabled) {
    progress.skipped = true;
    progress.reason = "weekday_disabled";
    if (runDigest) {
      progress.digest = await publishSchoolLastMinuteDigestStories(service);
    }
    return progress;
  }

  progress.operationalActive = await isEveningOperationalForDay(service, dayRome);

  if (!progress.operationalActive && cancelIfNotOperational) {
    const { data: cancelledCount, error: cancelError } = await service.rpc(
      "last_minute_cancel_active_for_local_day",
      { p_day: dayRome },
    );
    if (!cancelError && typeof cancelledCount === "number") {
      progress.campaignsCancelled = cancelledCount;
    }
    progress.skipped = true;
    progress.reason = "evening_not_operational";
    if (runDigest) {
      progress.digest = await publishSchoolLastMinuteDigestStories(service);
    }
    return progress;
  }

  if (!progress.operationalActive) {
    progress.skipped = true;
    progress.reason = "evening_not_operational";
    if (runDigest) {
      progress.digest = await publishSchoolLastMinuteDigestStories(service);
    }
    return progress;
  }

  const { data: rooms, error: roomsError } = await service
    .from("rooms")
    .select("id, default_duration_minutes")
    .eq("is_active", true);

  if (roomsError) {
    throw new Error(roomsError.message);
  }

  progress.roomsScanned = rooms?.length ?? 0;

  const candidateSlots: Array<{ roomId: string; startAt: string; endAt: string }> =
    [];

  for (const room of rooms ?? []) {
    const roomId = room.id as string;
    const durationMinutes =
      typeof room.default_duration_minutes === "number" &&
      room.default_duration_minutes > 0
        ? room.default_duration_minutes
        : 60;

    let availability;
    try {
      availability = await getRoomAvailability(
        service,
        roomId,
        dayRome,
        durationMinutes,
        { prefetchNeighbors: false },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[lm-sync] availability skip room ${roomId}:`, message);
      continue;
    }

    for (const slot of availability.slots) {
      if (Date.parse(slot.startAt) <= now.getTime()) continue;
      if (!isSlotOpenForLastMinute(slot)) continue;

      const inBand = await slotInOperationalBand(service, slot.startAt, dayRome);
      if (!inBand) continue;

      if (
        !isLastMinuteAnchorSlot(
          slot.startAt,
          slot.endAt,
          operationalSchedule,
          durationMinutes,
        )
      ) {
        continue;
      }

      candidateSlots.push({
        roomId,
        startAt: slot.startAt,
        endAt: slot.endAt,
      });
    }
  }

  progress.candidates = candidateSlots.length;

  for (const slot of candidateSlots) {
    const { data: existing, error: existingError } = await service
      .from("last_minute_campaigns")
      .select("id")
      .eq("room_id", slot.roomId)
      .eq("start_at", slot.startAt)
      .eq("end_at", slot.endAt)
      .in("phase", ["phase1", "phase2"])
      .maybeSingle();

    if (existingError) {
      if (isMissingLastMinuteSchema(existingError.message)) {
        progress.skipped = true;
        progress.reason = "migration_not_applied";
        return progress;
      }
      throw new Error(existingError.message);
    }

    if (existing?.id) continue;

    const { error: insertError } = await service.from("last_minute_campaigns").insert({
      room_id: slot.roomId,
      start_at: slot.startAt,
      end_at: slot.endAt,
      phase: "phase1",
      phase1_started_at: nowIso,
    });

    if (insertError) {
      if (/duplicate key|last_minute_campaigns_no_active_overlap/i.test(insertError.message)) {
        continue;
      }
      if (isMissingLastMinuteSchema(insertError.message)) {
        progress.skipped = true;
        progress.reason = "migration_not_applied";
        return progress;
      }
      throw new Error(insertError.message);
    }

    progress.phase1Created += 1;
  }

  const { data: phase1Rows, error: phase1ListError } = await service
    .from("last_minute_campaigns")
    .select("id, start_at")
    .eq("phase", "phase1");

  if (phase1ListError) {
    if (isMissingLastMinuteSchema(phase1ListError.message)) {
      progress.skipped = true;
      progress.reason = "migration_not_applied";
      return progress;
    }
    throw new Error(phase1ListError.message);
  }

  for (const row of phase1Rows ?? []) {
    const hours = hoursUntilSlotStart(row.start_at as string, now);
    if (hours <= 0 || hours > LAST_MINUTE_PHASE2_HOURS) continue;

    const { data: updated, error: advanceError } = await service
      .from("last_minute_campaigns")
      .update({
        phase: "phase2",
        phase2_started_at: nowIso,
      })
      .eq("id", row.id)
      .eq("phase", "phase1")
      .select("id")
      .maybeSingle();

    if (advanceError) {
      throw new Error(advanceError.message);
    }

    if (updated?.id) {
      progress.phase2Advanced += 1;
    }
  }

  if (runDigest) {
    progress.digest = await publishSchoolLastMinuteDigestStories(service);
  }

  return progress;
}

export async function syncLastMinuteAfterBookingConfirmed(
  service: SchoolClient,
  bookingId: string,
): Promise<LastMinuteDaySyncProgress | { skipped: true; reason: string }> {
  const { data: booking, error } = await service
    .from("bookings")
    .select("id, status, start_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!booking?.id || booking.status !== "confirmed") {
    return { skipped: true, reason: "not_confirmed" };
  }

  const dayRome = romeDayFromIso(booking.start_at as string);
  const inBand = await slotInOperationalBand(
    service,
    booking.start_at as string,
    dayRome,
  );

  if (!inBand) {
    return { skipped: true, reason: "outside_operational_band" };
  }

  return syncLastMinuteForDay(service, dayRome, {
    runDigest: true,
    cancelIfNotOperational: false,
  });
}