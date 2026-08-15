#!/usr/bin/env node
/**
 * Smoke test — path pagamento sale (RPC apply_stripe_room_booking_payment).
 * Crea una prenotazione temporanea, applica il pagamento, verifica idempotenza, pulisce.
 *
 * Usage: node scripts/smoke-stripe-room-payment.mjs
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

const SMOKE_START = "2099-12-15T21:00:00.000Z";
const SMOKE_END = "2099-12-15T22:00:00.000Z";
const SMOKE_PI = `pi_smoke_room_${Date.now()}`;
const SMOKE_EVENT = `evt_smoke_room_${Date.now()}`;

console.log("Smoke test — Stripe room payment RPC\n");

const { data: room, error: roomErr } = await service
  .from("rooms")
  .select("id, name")
  .eq("is_active", true)
  .order("sort_order")
  .limit(1)
  .maybeSingle();

if (roomErr || !room) {
  fail(`sala attiva: ${roomErr?.message ?? "nessuna"}`);
  process.exit(1);
}

const { data: member, error: memberErr } = await service
  .from("members")
  .select("id, first_name")
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();

if (memberErr || !member) {
  fail(`membro attivo: ${memberErr?.message ?? "nessuno"}`);
  process.exit(1);
}

await service
  .from("bookings")
  .delete()
  .eq("room_id", room.id)
  .eq("start_at", SMOKE_START)
  .ilike("notes", "SMOKE TEST room payment%");

const { data: booking, error: insertErr } = await service
  .from("bookings")
  .insert({
    room_id: room.id,
    member_id: member.id,
    start_at: SMOKE_START,
    end_at: SMOKE_END,
    status: "pending",
    payment_status: "unpaid",
    duration_minutes: 60,
    total_price_eur: 10,
    title: "SMOKE TEST room payment",
    notes: "SMOKE TEST room payment — auto-cleanup",
  })
  .select("id, status, payment_status")
  .single();

if (insertErr || !booking) {
  fail(`insert booking: ${insertErr?.message ?? "nessuna riga"}`);
  process.exit(1);
}
ok(`booking pending/unpaid ${booking.id.slice(0, 8)}… (${room.name})`);

const { data: applied, error: rpcErr } = await service.rpc(
  "apply_stripe_room_booking_payment",
  {
    p_booking_ref: booking.id,
    p_stripe_event_id: SMOKE_EVENT,
    p_stripe_event_type: "checkout.session.completed",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: 1000,
  },
);

if (rpcErr) {
  fail(`apply_stripe_room_booking_payment: ${rpcErr.message}`);
} else if (!applied?.success) {
  fail(`RPC success=false: ${applied?.message ?? JSON.stringify(applied)}`);
} else {
  ok(`RPC apply — ${applied.status ?? "confirmed"} rows=${applied.rows_updated ?? "?"}`);
}

const { data: paid } = await service
  .from("bookings")
  .select("status, payment_status, paid_at, stripe_payment_intent_id")
  .eq("id", booking.id)
  .maybeSingle();

if (paid?.status === "confirmed" && paid.payment_status === "paid" && paid.paid_at) {
  ok(`DB — status=confirmed payment_status=paid pi=${paid.stripe_payment_intent_id ? "set" : "missing"}`);
} else {
  fail(
    `DB atteso confirmed/paid, ottenuto ${paid?.status}/${paid?.payment_status} paid_at=${paid?.paid_at ?? "null"}`,
  );
}

const { data: again, error: againErr } = await service.rpc(
  "apply_stripe_room_booking_payment",
  {
    p_booking_ref: booking.id,
    p_stripe_event_id: `${SMOKE_EVENT}_retry`,
    p_stripe_event_type: "payment_intent.succeeded",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: 1000,
  },
);

if (againErr) fail(`idempotenza RPC: ${againErr.message}`);
else if (again?.duplicate === true) ok("idempotenza — duplicate=true, nessun doppio update");
else fail(`idempotenza attesa duplicate=true, ottenuto ${JSON.stringify(again)}`);

const { error: delErr } = await service.from("bookings").delete().eq("id", booking.id);
if (delErr) {
  await service
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id);
  fail(`cleanup delete: ${delErr.message} (booking lasciato cancelled)`);
} else {
  ok("cleanup — booking smoke rimosso");
}

console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test PASSED");
