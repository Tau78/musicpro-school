#!/usr/bin/env node
/**
 * Smoke — email prenotazione via Google SMTP (API interna Vercel).
 * Usage: node scripts/smoke-booking-email.mjs [--live]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createSmokeClients } from "./lib/supabase-smoke.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");

function loadEnvFile(path) {
  const map = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      map[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch {
    // optional
  }
  return map;
}

const env = {
  ...loadEnvFile(join(root, "musicpro/.env")),
  ...loadEnvFile(join(root, "musicpro/.env.local")),
  ...process.env,
};

const baseUrl = (env.PLAYWRIGHT_BASE_URL || env.NEXT_PUBLIC_SCHOOL_PUBLIC_URL || "https://school.musicproeventi.it").replace(/\/$/, "");
const secret = env.ISCRIZIONE_INTERNAL_SECRET?.trim() || env.CRON_SECRET?.trim();

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

console.log("Smoke test — booking email (Google SMTP)\n");

if (!secret) {
  fail("Manca ISCRIZIONE_INTERNAL_SECRET o CRON_SECRET");
}

const hasSmtp =
  Boolean(env.GOOGLE_SMTP_USER?.trim()) &&
  Boolean(env.GOOGLE_SMTP_APP_PASSWORD?.trim());

if (!hasSmtp && !live) {
  fail("GOOGLE_SMTP_USER / GOOGLE_SMTP_APP_PASSWORD non in env locale (Vercel prod?)");
}

const { service } = createSmokeClients();

const { data: booking } = await service
  .from("bookings")
  .select("id, status")
  .eq("status", "confirmed")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!booking?.id) {
  fail("Nessuna prenotazione confirmed per probe");
} else {
  ok(`booking probe ${booking.id.slice(0, 8)}…`);
}

if (process.exitCode) process.exit(process.exitCode);

const resp = await fetch(`${baseUrl}/api/internal/bookings/send-email`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-iscrizione-internal-secret": secret,
  },
  body: JSON.stringify({
    booking_id: booking.id,
    template: "confirm",
    force: true,
  }),
});

const payload = await resp.json().catch(() => ({}));
if (!resp.ok || payload.success === false) {
  fail(`API ${resp.status}: ${payload.message ?? JSON.stringify(payload)}`);
} else if (payload.sent) {
  ok(`email inviata → ${payload.recipient ?? "?"}`);
} else if (payload.skipped) {
  fail(`skipped: ${payload.message ?? "?"}`);
} else {
  ok(`risposta: ${payload.message ?? "ok"}`);
}

if (!process.exitCode) console.log("\nSmoke test PASSED");
