#!/usr/bin/env node
/**
 * Smoke test: Google Calendar availability + booking sync.
 *
 * Usage (from repo root):
 *   node scripts/smoke-calendar-booking.mjs
 *
 * Requires musicpro/.env with NEXT_PUBLIC_SUPABASE_* and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, "musicpro/.env");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti in musicpro/.env");
  process.exit(1);
}

const service = createClient(supabaseUrl, serviceKey);

function ok(label) {
  console.log(`OK  ${label}`);
}

function fail(label, detail) {
  console.error(`FAIL ${label}: ${detail}`);
  process.exitCode = 1;
}

async function checkMigration010() {
  const { data, error } = await service
    .from("bookings")
    .select("google_calendar_event_id, google_calendar_synced_at, google_calendar_sync_error")
    .limit(1);

  if (error?.message?.includes("google_calendar_event_id")) {
    fail("migration 010", "colonna google_calendar_event_id assente — esegui supabase db push");
    return;
  }
  if (error) {
    fail("migration 010", error.message);
    return;
  }
  ok("migration 010 — colonne google_calendar_* presenti");
}

async function checkCalendarSetting() {
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "booking_google_calendar_id")
    .maybeSingle();

  if (error) {
    fail("app_settings", error.message);
    return;
  }
  if (!data?.value?.trim()) {
    fail("app_settings", "booking_google_calendar_id non configurato");
    return;
  }
  ok(`calendar ID configurato (${data.value.trim().slice(0, 20)}…)`);
}

async function checkRoomColors() {
  const { data, error } = await service
    .from("rooms")
    .select("name, google_calendar_color_id")
    .eq("is_active", true);

  if (error) {
    fail("rooms", error.message);
    return;
  }

  const missing = (data ?? []).filter((r) => !r.google_calendar_color_id);
  if (missing.length > 0) {
    fail("rooms", `colorId mancante per: ${missing.map((r) => r.name).join(", ")}`);
    return;
  }
  ok(`room colorId — ${data?.length ?? 0} sale`);
}

async function checkCalendarAvailabilityEdge() {
  const { data: room, error: roomError } = await service
    .from("rooms")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (roomError || !room) {
    fail("calendar-availability", roomError?.message ?? "nessuna sala attiva");
    return;
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
  }).format(new Date());

  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/calendar-availability`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ room_id: room.id, date: today }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (String(payload.message ?? "").includes("Not Found")) {
      console.warn(
        "WARN calendar-availability: calendario non accessibile al service account — condividi il calendario con musicproschool@musicpro-eventi.iam.gserviceaccount.com",
      );
      return;
    }
    fail("calendar-availability Edge", `${res.status} ${payload.message ?? JSON.stringify(payload)}`);
    return;
  }

  if (payload.warning) {
    console.warn(`WARN calendar-availability: ${payload.warning}`);
  }

  if (!payload.success) {
    fail("calendar-availability Edge", payload.message ?? "success=false");
    return;
  }

  ok(
    `calendar-availability Edge — sala ${room.name}, ${Array.isArray(payload.busy) ? payload.busy.length : 0} eventi occupati oggi`,
  );
}

async function checkBookingCalendarSyncEdge() {
  const { data: booking, error } = await service
    .from("bookings")
    .select("id, status, google_calendar_event_id")
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    fail("booking-calendar-sync", error.message);
    return;
  }

  if (!booking) {
    console.log("SKIP booking-calendar-sync — nessuna prenotazione confirmed da testare");
    return;
  }

  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/booking-calendar-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ booking_id: booking.id, action: "upsert" }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok || !payload.success) {
    if (String(payload.message ?? "").includes("Not Found")) {
      console.warn(
        "WARN booking-calendar-sync: calendario non accessibile — condividi con musicproschool@musicpro-eventi.iam.gserviceaccount.com",
      );
      return;
    }
    fail(
      "booking-calendar-sync Edge",
      `${res.status} ${payload.message ?? JSON.stringify(payload)}`,
    );
    return;
  }

  const { data: updated } = await service
    .from("bookings")
    .select("google_calendar_event_id, google_calendar_sync_error")
    .eq("id", booking.id)
    .maybeSingle();

  if (updated?.google_calendar_sync_error) {
    fail("booking-calendar-sync DB", updated.google_calendar_sync_error);
    return;
  }

  ok(
    `booking-calendar-sync Edge — booking ${booking.id.slice(0, 8)}… event=${updated?.google_calendar_event_id ?? payload.google_event_id ?? "?"}`,
  );
}

async function checkOverlapQuery() {
  const { data: room } = await service
    .from("rooms")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!room) return;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
  }).format(new Date());

  const dayStart = `${today}T00:00:00+02:00`;
  const next = new Date(`${today}T12:00:00+02:00`);
  next.setDate(next.getDate() + 1);
  const dayEnd = next.toISOString().slice(0, 10) + "T00:00:00+02:00";

  const { data, error } = await service
    .from("bookings")
    .select("id")
    .eq("room_id", room.id)
    .lt("start_at", dayEnd)
    .gt("end_at", dayStart)
    .neq("status", "cancelled");

  if (error) {
    fail("overlap query", error.message);
    return;
  }

  ok(`overlap query — ${data?.length ?? 0} prenotazioni attive oggi (sala test)`);
}

console.log("Smoke test — Google Calendar booking\n");

await checkMigration010();
await checkCalendarSetting();
await checkRoomColors();
await checkOverlapQuery();
await checkCalendarAvailabilityEdge();
await checkBookingCalendarSyncEdge();

console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test PASSED");
