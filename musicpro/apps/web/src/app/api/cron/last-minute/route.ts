import { type Database, romeToday } from "@musicpro/database";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sendLastMinuteCronReportEmail } from "@/lib/last-minute/cron-report-email";
import { syncLastMinuteForDay } from "@/lib/last-minute/sync-last-minute-day";
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
  const dayRome = romeToday();

  try {
    const result = await syncLastMinuteForDay(service, dayRome, {
      runDigest: true,
      cancelIfNotOperational: true,
      now,
    });

    if (result.reason === "migration_not_applied") {
      return respondMigrationSkip(service, dayRome, result.reason);
    }

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: lmSalesCount, error: lmSalesError } = await service
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .not("last_minute_campaign_id", "is", null)
      .gte("created_at", sevenDaysAgo)
      .neq("status", "cancelled");
    const lmSalesLast7d =
      !lmSalesError && typeof lmSalesCount === "number" ? lmSalesCount : undefined;

    const digest = result.digest ?? (await runDigestStories(service));

    await maybeSendCronReport(service, {
      dayRome,
      success: true,
      skipped: result.skipped,
      reason: result.reason,
      operationalActive: result.operationalActive,
      dayEnabled: result.dayEnabled,
      roomsScanned: result.roomsScanned,
      candidates: result.candidates,
      phase1Created: result.phase1Created,
      phase2Advanced: result.phase2Advanced,
      campaignsCancelled: result.campaignsCancelled,
      lmSalesLast7d,
      digest,
      eventiCredsPresent: eventiCredsPresent(),
    });

    return NextResponse.json({
      success: true,
      dayRome,
      skipped: result.skipped,
      reason: result.reason,
      operationalActive: result.operationalActive,
      eveningGated: !result.operationalActive,
      dayEnabled: result.dayEnabled,
      roomsScanned: result.roomsScanned,
      candidates: result.candidates,
      phase1Created: result.phase1Created,
      phase2Advanced: result.phase2Advanced,
      campaignsCancelled: result.campaignsCancelled,
      digest,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cron last minute fallito";
    if (/booking_evening_operational_active|does not exist/i.test(message)) {
      return respondMigrationSkip(service, dayRome, message);
    }
    const digest = await runDigestStories(service);
    await maybeSendCronReport(service, {
      dayRome,
      success: false,
      message: message.slice(0, 500),
      digest,
      eventiCredsPresent: eventiCredsPresent(),
    });
    return NextResponse.json(
      { success: false, message: message.slice(0, 500) },
      { status: 500 },
    );
  }
}