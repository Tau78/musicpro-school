#!/usr/bin/env node
/**
 * Smoke Classic XPay School — file, MAC SHA1, opzionale RPC live.
 * Usage:
 *   node scripts/smoke-nexi-xpay.mjs
 *   node scripts/smoke-nexi-xpay.mjs --live
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = {
  ...readEnvFile(join(root, ".env")),
  ...readEnvFile(join(root, "musicpro/.env")),
};

console.log("Smoke — Nexi Classic XPay (School)\n");

const requiredFiles = [
  "supabase/functions/_shared/nexi-xpay.ts",
  "supabase/functions/nexi-xpay-pay/index.ts",
  "supabase/functions/nexi-xpay-notify/index.ts",
  "supabase/functions/nexi-xpay-return/index.ts",
  "supabase/migrations/075_nexi_xpay_payments.sql",
  "musicpro/apps/web/public/paga-nexi.html",
  "musicpro/apps/web/src/lib/nexi/mint-payment.ts",
];

for (const rel of requiredFiles) {
  if (existsSync(join(root, rel))) ok(`file ${rel}`);
  else fail(`manca ${rel}`);
}

const payHtml = readFileSync(
  join(root, "musicpro/apps/web/public/paga-nexi.html"),
  "utf8",
);
if (payHtml.includes("mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/nexi-xpay-pay")) {
  ok("paga-nexi.html punta all'Edge School");
} else {
  fail("paga-nexi.html senza Edge School");
}

const notifySrc = readFileSync(
  join(root, "supabase/functions/nexi-xpay-notify/index.ts"),
  "utf8",
);
if (notifySrc.includes("apply_nexi_payment") && notifySrc.includes("verifyPaymentResponseMac")) {
  ok("notify: MAC + apply_nexi_payment");
} else {
  fail("notify incompleto");
}

const mintSrc = readFileSync(
  join(root, "musicpro/apps/web/src/lib/nexi/mint-payment.ts"),
  "utf8",
);
if (mintSrc.includes("api.stripe.com")) {
  fail("mint ancora chiama Stripe");
} else {
  ok("mint senza Stripe API");
}

const testKey = "smoke-mac-key";
const codTrans = "MP270926abcdefghijklmno";
const importo = "1500";
const reqPayload = `codTrans=${codTrans}divisa=EURimporto=${importo}${testKey}`;
const reqMac = createHash("sha1").update(reqPayload).digest("hex");
if (reqMac.length === 40 && /^[0-9a-f]+$/.test(reqMac)) {
  ok(`MAC request ${reqMac.length} hex`);
} else {
  fail("MAC request non valido");
}

const resPayload =
  `codTrans=${codTrans}esito=OKimporto=${importo}divisa=EURdata=20260927orario=120000codAut=ABC${testKey}`;
const resMac = createHash("sha1").update(resPayload).digest("hex");
if (resMac.length === 40) ok("MAC response 40 hex");
else fail("MAC response non valido");

if (!live) {
  console.log(process.exitCode ? "\nSmoke static FAILED" : "\nSmoke static PASSED");
  process.exit(process.exitCode || 0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  fail("Supabase URL o service role mancanti");
  process.exit(1);
}

const service = createClient(supabaseUrl, serviceKey);
const liveCod = `MP${Date.now().toString(36)}${randomBytes(4).toString("hex")}`.slice(0, 30);
const SMOKE_START = "2099-12-16T21:00:00.000Z";
const SMOKE_END = "2099-12-16T22:00:00.000Z";

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
  .ilike("notes", "SMOKE TEST nexi%");

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
    title: "SMOKE TEST nexi",
    notes: "SMOKE TEST nexi — auto-cleanup",
  })
  .select("id")
  .single();

if (insertErr || !booking) {
  fail(`insert booking: ${insertErr?.message ?? "nessuna riga"}`);
  process.exit(1);
}
ok(`booking ${booking.id.slice(0, 8)}…`);

const { error: orderErr } = await service.from("nexi_payment_orders").insert({
  flow: "room_booking",
  provider_payment_id: liveCod,
  amount_cents: 1000,
  status: "pending",
  payment_link_url: `https://school.musicproeventi.it/paga-nexi.html?t=${liveCod}`,
  booking_id: booking.id,
  member_id: member.id,
  description: "Smoke Nexi sala",
});

if (orderErr) {
  fail(`insert order: ${orderErr.message}`);
} else {
  ok("ordine Nexi pending");
}

const { data: applied, error: rpcErr } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: liveCod,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: 1000,
});

if (rpcErr) fail(`apply_nexi_payment: ${rpcErr.message}`);
else if (!applied?.success) fail(`RPC success=false: ${JSON.stringify(applied)}`);
else ok(`RPC apply flow=${applied.flow ?? "?"}`);

const { data: paid } = await service
  .from("bookings")
  .select("status, payment_status, paid_at")
  .eq("id", booking.id)
  .maybeSingle();

if (paid?.status === "confirmed" && paid.payment_status === "paid" && paid.paid_at) {
  ok("booking confirmed/paid");
} else {
  fail(`DB atteso confirmed/paid, ottenuto ${paid?.status}/${paid?.payment_status}`);
}

const { data: again, error: againErr } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: liveCod,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: 1000,
});

if (againErr) fail(`idempotenza: ${againErr.message}`);
else if (again?.duplicate === true) ok("idempotenza duplicate=true");
else fail(`idempotenza attesa duplicate, ottenuto ${JSON.stringify(again)}`);

await service.from("nexi_payment_receipts").delete().eq("cod_trans", liveCod);
await service.from("nexi_payment_orders").delete().eq("provider_payment_id", liveCod);
const { error: delErr } = await service.from("bookings").delete().eq("id", booking.id);
if (delErr) {
  await service
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id);
  fail(`cleanup delete: ${delErr.message}`);
} else {
  ok("cleanup");
}

console.log(process.exitCode ? "\nSmoke live FAILED" : "\nSmoke live PASSED");
