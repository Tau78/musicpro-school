import {
  type Database,
  getOperationalWeekSchedule,
  getRoomAvailability,
  hoursUntilSlotStart,
  isLastMinuteAnchorSlot,
  isSlotOpenForLastMinute,
  LAST_MINUTE_PHASE2_HOURS,
  romeToday,
} from "@musicpro/database";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sendLastMinuteCronReportEmail } from "@/lib/last-minute/cron-report-email";
import {
  publishSchoolLastMinuteDigestStories,
  type PublishDigestStoriesResult,
} from "@/lib/queue-school-lm-story-to-eventi";

export const runtime = "nodejs";

function eventiCredsPresent(): boolean {
  return Boolean(
    process.env.EVENTI_SUPABASE_URL?.trim() &&
      process.env.EVENTI_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

async function maybeSendCronReport(
  service: SupabaseClient<Database>,
  payload: Parameters<typeof sendLastMinuteCronReportEmail>[1],
) {
  try {
    const mail = await sendLastMinuteCronReportEmail(service, {
      ...payload,
      eventiCredsPresent: eventiCredsPresent(),
    });
    if (!mail.sent) {
      console.warn("[cron/last-minute] report email:", mail.error ?? "not sent");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[cron/last-minute] report email throw:", message.slice(0, 200));
  }
}

async function runDigestStories(
  service: SupabaseClient<Database>,
): Promise<PublishDigestStoriesResult> {
  try {
    return await publishSchoolLastMinuteDigestStories(service);
  } catch (digestError) {
    const digestMessage =
      digestError instanceof Error ? digestError.message : String(digestError);
    console.warn("[cron/last-minute] digest stories:", digestMessage);
    return {
      success: false,
      reason: "digest_publish_error",
      days: [],
    };
  }
}

type RunProgress = {
  phase1Created: number;
  phase2Advanced: number;
  candidates: number;
  roomsScanned: number;
  operationalActive?: boolean;
};

async function respondMigrationSkip(
  service: SupabaseClient<Database>,
  dayRome: string,
  message: string,
) {
  const digest = await runDigestStories(service);
  await maybeSendCronReport(service, {
    dayRome,
    success: true,
    skipped: true,
    reason: "migration_not_applied",
    message: message.slice(0, 500),
    digest,
    eventiCredsPresent: eventiCredsPresent(),
  });
  return NextResponse.json({
    success: true,
    skipped: true,
    reason: "migration_not_applied",
    message: message.slice(0, 500),
    digest,
  });
}

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

function isMissingLastMinuteSchema(message: string): boolean {
  return /last_minute_campaigns|schema cache|does not exist|Could not find|PGRST205/i.test(
    message,
  );
}

async function slotInOperationalBand(
  service: SupabaseClient<Database>,
  startAt: string,
  dayRome: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("booking_start_in_operational_band", {
    p_start_at: startAt,
    p_day: dayRome,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { success: false, message: "Config Supabase mancante" },
      { status: 500 },
    );
  }

  const service = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const dayRome = romeToday();

  const progress: RunProgress = {
    phase1Created: 0,
    phase2Advanced: 0,
    candidates: 0,
    roomsScanned: 0,
  };

  try {
    const { data: operationalActive, error: operationalError } = await service.rpc(
      "booking_evening_operational_active",
      { p_day: dayRome },
    );

    if (operationalError) {
      if (/booking_evening_operational_active|does not exist/i.test(operationalError.message)) {
        return respondMigrationSkip(service, dayRome, operationalError.message);
      }
      throw new Error(operationalError.message);
    }

    progress.operationalActive = operationalActive === true;

    if (!operationalActive) {
      const digest = await runDigestStories(service);
      await maybeSendCronReport(service, {
        dayRome,
        success: true,
        skipped: true,
        reason: "evening_not_operational",
        operationalActive: false,
        phase1Created: 0,
        phase2Advanced: 0,
        digest,
        eventiCredsPresent: eventiCredsPresent(),
      });
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "evening_not_operational",
        dayRome,
        phase1Created: 0,
        phase2Advanced: 0,
        digest,
      });
    }

    const operationalSchedule = await getOperationalWeekSchedule(service);

    const { data: rooms, error: roomsError } = await service
      .from("rooms")
      .select("id, default_duration_minutes")
      .eq("is_active", true);

    if (roomsError) {
      const digest = await runDigestStories(service);
      await maybeSendCronReport(service, {
        dayRome,
        success: false,
        message: roomsError.message,
        operationalActive: progress.operationalActive,
        digest,
        eventiCredsPresent: eventiCredsPresent(),
      });
      return NextResponse.json(
        { success: false, message: roomsError.message },
        { status: 500 },
      );
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
        console.warn(`[cron/last-minute] availability skip room ${roomId}:`, message);
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
          return respondMigrationSkip(service, dayRome, existingError.message);
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
          return respondMigrationSkip(service, dayRome, insertError.message);
        }
        throw new Error(insertError.message);
      }

      progress.phase1Created += 1;
      // TODO(email): invio fase 1 urgenza (senza sconto) agli associati storici slot.
      // TODO(meta): bozza/post storia fase 1 su canale Meta School.
      // TODO(telegram): notifica staff — slot libero, campagna phase1 avviata.
    }

    progress.candidates = candidateSlots.length;

    const { data: phase1Rows, error: phase1ListError } = await service
      .from("last_minute_campaigns")
      .select("id, start_at")
      .eq("phase", "phase1");

    if (phase1ListError) {
      if (isMissingLastMinuteSchema(phase1ListError.message)) {
        return respondMigrationSkip(service, dayRome, phase1ListError.message);
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
        // TODO(email): re-invio mirato fase 2 con prezzo last minute nel deep link.
        // TODO(meta): aggiornamento storia/post fase 2 (prezzo slot).
        // TODO(telegram): notifica staff — sconto/prezzo LM attivo su slot.
      }
    }

    const digest = await runDigestStories(service);

    await maybeSendCronReport(service, {
      dayRome,
      success: true,
      operationalActive: true,
      roomsScanned: progress.roomsScanned,
      candidates: progress.candidates,
      phase1Created: progress.phase1Created,
      phase2Advanced: progress.phase2Advanced,
      digest,
      eventiCredsPresent: eventiCredsPresent(),
    });

    return NextResponse.json({
      success: true,
      dayRome,
      operationalActive: true,
      roomsScanned: progress.roomsScanned,
      candidates: progress.candidates,
      phase1Created: progress.phase1Created,
      phase2Advanced: progress.phase2Advanced,
      digest,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cron last minute fallito";
    const digest = await runDigestStories(service);
    await maybeSendCronReport(service, {
      dayRome,
      success: false,
      message: message.slice(0, 500),
      operationalActive: progress.operationalActive,
      roomsScanned: progress.roomsScanned,
      candidates: progress.candidates,
      phase1Created: progress.phase1Created,
      phase2Advanced: progress.phase2Advanced,
      digest,
      eventiCredsPresent: eventiCredsPresent(),
    });
    return NextResponse.json(
      { success: false, message: message.slice(0, 500) },
      { status: 500 },
    );
  }
}
