#!/usr/bin/env node
/**
 * Smoke test — Fase 2 (penali, review crediti, PROVI, admin config).
 * Usage: node scripts/smoke-phase2.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, "musicpro/.env"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("FAIL: Supabase URL o service role mancanti");
  process.exit(1);
}

const service = createClient(supabaseUrl, serviceKey);

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

console.log("Smoke test — Fase 2\n");

const checks = [
  async () => {
    const { error } = await service.from("cancellation_penalty_rules").select("id").limit(1);
    if (error) fail(`cancellation_penalty_rules: ${error.message}`);
    else ok("cancellation_penalty_rules — tabella presente");
  },
  async () => {
    const { data, error } = await service.from("cancellation_penalty_rules").select("id").eq("enabled", true);
    if (error) fail(`penalty seed: ${error.message}`);
    else ok(`penalty rules seed — ${data?.length ?? 0} fasce attive`);
  },
  async () => {
    const { error } = await service
      .from("rooms")
      .select("provi_da_solo_enabled, provi_da_solo_discount_eur")
      .limit(1);
    if (error?.message?.includes("provi_da_solo")) {
      fail("migration 013 — colonne PROVI mancanti");
    } else if (error) {
      fail(`rooms provi: ${error.message}`);
    } else ok("rooms — colonne PROVI DA SOLO presenti");
  },
  async () => {
    const { error } = await service.from("room_provi_da_solo_schedule").select("id").limit(1);
    if (error) fail(`room_provi_da_solo_schedule: ${error.message}`);
    else ok("room_provi_da_solo_schedule — tabella presente");
  },
  async () => {
    const keys = [
      "booking_auto_confirm_min_hours",
      "booking_approval_min_hours",
      "booking_cancel_min_hours",
      "booking_modify_min_hours",
      "booking_band_required",
    ];
    const { data, error } = await service.from("app_settings").select("key").in("key", keys);
    if (error) fail(`app_settings: ${error.message}`);
    else ok(`app_settings booking — ${data?.length ?? 0}/5 chiavi`);
  },
  async () => {
    const { error } = await service.from("room_external_calendars").select("id").limit(1);
    if (error) fail(`room_external_calendars: ${error.message}`);
    else ok("room_external_calendars — tabella presente");
  },
  async () => {
    const { error } = await service.from("booking_audit_log").select("id").limit(1);
    if (error) fail(`booking_audit_log: ${error.message}`);
    else ok("booking_audit_log — tabella presente");
  },
  async () => {
    const { error } = await service.from("booking_email_log").select("id").limit(1);
    if (error) fail(`booking_email_log: ${error.message}`);
    else ok("booking_email_log — tabella presente");
  },
  async () => {
    const { error } = await service.rpc("admin_update_booking_safe", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
      p_room_id: "00000000-0000-0000-0000-000000000001",
      p_start_at: "2026-01-01T10:00:00.000Z",
      p_end_at: "2026-01-01T11:00:00.000Z",
      p_duration_minutes: 60,
      p_notes: null,
    });
    if (error && !error.message.includes("NOT_AUTHENTICATED") && !error.message.includes("NOT_FOUND")) {
      fail(`admin_update_booking_safe: ${error.message}`);
    } else ok("admin_update_booking_safe — RPC registrata");
  },
  async () => {
    const { error } = await service.rpc("review_booking_safe", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
      p_action: "approve",
    });
    if (error && !error.message.includes("NOT_AUTHENTICATED") && !error.message.includes("NOT_FOUND")) {
      fail(`review_booking_safe RPC: ${error.message}`);
    } else ok("review_booking_safe — RPC registrata");
  },
  async () => {
    const { error } = await service.rpc("cancel_booking_safe", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
      p_skip_penalty: false,
    });
    if (error && !error.message.includes("NOT_AUTHENTICATED") && !error.message.includes("NOT_FOUND")) {
      fail(`cancel_booking_safe RPC: ${error.message}`);
    } else ok("cancel_booking_safe — RPC con p_skip_penalty");
  },
  async () => {
    const { error } = await service.rpc("release_booking_credits_internal", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
    });
    if (error?.message?.includes("does not exist")) {
      fail("release_booking_credits_internal — funzione mancante (migration 012?)");
    } else ok("release_booking_credits_internal — funzione presente");
  },
  async () => {
    const { data, error } = await service.rpc("debit_booking_credits", {
      p_booking_id: "00000000-0000-0000-0000-000000000000",
      p_credits: null,
    });
    if (error?.message?.includes("does not exist")) {
      fail("debit_booking_credits (021) — funzione mancante");
    } else if (data?.error_code === "HOLD_MISMATCH") {
      fail("debit_booking_credits (021) — ancora HOLD_MISMATCH");
    } else {
      ok("debit_booking_credits (021) — RPC registrata");
    }
  },
];

for (const check of checks) {
  await check();
}

console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test PASSED");
