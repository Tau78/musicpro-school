#!/usr/bin/env node
/**
 * Prenotazione end-to-end con account Playwright (crediti + email).
 * Usage: node scripts/test-playwright-associato-booking.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSmokeClients,
  signInClient,
} from "./lib/supabase-smoke.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const email =
  env.PLAYWRIGHT_ASSOCIATO_EMAIL?.trim() ||
  "playwright.associato.test@musicproeventi.it";
const password = env.PLAYWRIGHT_ASSOCIATO_PASSWORD?.trim();
const baseUrl = (
  env.PLAYWRIGHT_BASE_URL ||
  env.NEXT_PUBLIC_SCHOOL_PUBLIC_URL ||
  "https://school.musicproeventi.it"
).replace(/\/$/, "");

if (!password) {
  console.error("FAIL: PLAYWRIGHT_ASSOCIATO_PASSWORD mancante in .env.local");
  process.exit(1);
}

const { supabaseUrl, anonKey, service } = createSmokeClients();

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

console.log("Test — prenotazione account Playwright\n");

const { data: member } = await service
  .from("members")
  .select("id, email, first_name, last_name")
  .eq("email", email)
  .maybeSingle();

if (!member?.id) {
  fail(`Member non trovato per ${email}`);
  process.exit(1);
}
ok(`member ${member.id.slice(0, 8)}… (${email})`);

const { data: room } = await service
  .from("rooms")
  .select("id, name, default_duration_minutes")
  .eq("is_active", true)
  .order("sort_order")
  .limit(1)
  .maybeSingle();

if (!room?.id) {
  fail("Nessuna sala attiva");
  process.exit(1);
}
ok(`sala ${room.name}`);

const duration = room.default_duration_minutes || 120;

const { client, session } = await signInClient(supabaseUrl, anonKey, email, password);
ok("login associato");

// Slot tra 3–10 giorni (auto-conferma, evita collisioni)
let bookingResult = null;
let startAt = null;
let endAt = null;

for (let dayOffset = 3; dayOffset <= 10; dayOffset += 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(7, 0, 0, 0); // ~09:00 Rome (CEST)
  startAt = d.toISOString();
  const end = new Date(d.getTime() + duration * 60_000);
  endAt = end.toISOString();

  const { data, error } = await client.rpc("create_booking_safe", {
    p_room_id: room.id,
    p_member_id: member.id,
    p_start_at: startAt,
    p_end_at: endAt,
    p_provi_da_solo: false,
    p_band_id: null,
  });

  if (error) {
    fail(`create_booking_safe: ${error.message}`);
    process.exit(1);
  }

  if (data?.success) {
    bookingResult = data;
    break;
  }

  if (data?.error_code !== "SLOT_TAKEN") {
    fail(`${data?.error_code ?? "?"}: ${data?.error_message ?? "create failed"}`);
    process.exit(1);
  }
}

if (!bookingResult?.booking_id) {
  fail("Nessuno slot libero in 3–10 giorni");
  process.exit(1);
}

const bookingId = bookingResult.booking_id;
ok(`booking creata ${bookingId.slice(0, 8)}… status=${bookingResult.status}`);

const creditCost = Math.ceil(duration / 60);

const { data: debitData, error: debitError } = await client.rpc(
  "debit_booking_credits",
  {
    p_booking_id: bookingId,
    p_credits: creditCost,
  },
);

if (debitError) {
  fail(`debit_booking_credits: ${debitError.message}`);
} else if (!debitData?.success) {
  fail(
    `${debitData?.error_code ?? "?"}: ${debitData?.error_message ?? "debit failed"}`,
  );
} else {
  ok(
    `pagamento crediti (${creditCost}) — status ${debitData.status ?? "ok"} payment=${debitData.payment_status ?? "?"}`,
  );
}

const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const edgeHeaders = {
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};
const edgeBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;

const emailResp = await fetch(`${edgeBase}/send-booking-email`, {
  method: "POST",
  headers: edgeHeaders,
  body: JSON.stringify({
    booking_id: bookingId,
    template: "confirm",
    force: true,
  }),
});

const emailPayload = await emailResp.json().catch(() => ({}));
if (emailPayload.sent) {
  ok(`email inviata → ${emailPayload.recipient ?? email}`);
} else if (emailPayload.skipped) {
  fail(`email skipped: ${emailPayload.message}`);
} else if (!emailResp.ok || emailPayload.success === false) {
  fail(`email ${emailResp.status}: ${emailPayload.message ?? JSON.stringify(emailPayload)}`);
} else {
  ok(`email: ${emailPayload.message ?? "ok"}`);
}

const { data: bookingAfterPay } = await service
  .from("bookings")
  .select("id, status")
  .eq("id", bookingId)
  .maybeSingle();

if (bookingAfterPay?.status === "confirmed") {
  const calResp = await fetch(`${edgeBase}/booking-calendar-sync`, {
    method: "POST",
    headers: edgeHeaders,
    body: JSON.stringify({ booking_id: bookingId, action: "upsert" }),
  });
  const calPayload = await calResp.json().catch(() => ({}));
  if (!calResp.ok || calPayload.success === false) {
    fail(
      `calendar-sync ${calResp.status}: ${calPayload.message ?? JSON.stringify(calPayload)}`,
    );
  } else {
    ok(
      `Google Calendar sync — action=${calPayload.action ?? "?"} event=${calPayload.google_event_id ?? "?"}`,
    );
  }
} else {
  fail(`booking non confirmed (status=${bookingAfterPay?.status ?? "?"}) — skip calendar sync`);
}

const { data: bookingRow } = await service
  .from("bookings")
  .select(
    "id, status, payment_status, start_at, end_at, google_calendar_event_id, google_calendar_sync_error",
  )
  .eq("id", bookingId)
  .maybeSingle();

if (
  bookingRow?.status === "confirmed" &&
  !bookingRow.google_calendar_event_id &&
  !process.exitCode
) {
  fail(
    `calendar sync incompleto: event_id assente${bookingRow.google_calendar_sync_error ? ` (${bookingRow.google_calendar_sync_error})` : ""}`,
  );
}

console.log("\nPrenotazione:", JSON.stringify(bookingRow, null, 2));

const { data: logs } = await service
  .from("booking_email_log")
  .select("status, error, created_at")
  .eq("booking_id", bookingId)
  .order("created_at", { ascending: false })
  .limit(1);

console.log("Email log:", JSON.stringify(logs?.[0] ?? null, null, 2));

await client.auth.signOut();

if (!process.exitCode) {
  console.log("\nTest PASSED");
  console.log(`→ Le mie prenotazioni: ${baseUrl}/prenotazioni/mie`);
}
