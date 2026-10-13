#!/usr/bin/env node
/**
 * Smoke — pacchetto lezioni via Nexi Classic XPay.
 *
 * Default (CI-friendly): wiring statico + probe RPC se Supabase presente.
 * Senza credenziali Supabase: SKIP live con warning, exit 0 se static ok.
 *
 * Usage:
 *   node scripts/smoke-lesson-pack-nexi.mjs
 *   node scripts/smoke-lesson-pack-nexi.mjs --live
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}
function skip(msg) {
  console.log(`SKIP ${msg}`);
}

console.log("Smoke — lezioni pacchetto Nexi\n");

// --- Static files ---
const requiredFiles = [
  "musicpro/apps/web/src/app/api/lezioni/checkout/route.ts",
  "musicpro/apps/web/src/lib/nexi/lesson-pack-payment-link.ts",
  "musicpro/apps/web/src/lib/nexi/mint-payment.ts",
  "supabase/migrations/075_nexi_xpay_payments.sql",
  "supabase/migrations/108_reconcile_pack_fees_on_positive_balance.sql",
];

for (const rel of requiredFiles) {
  if (existsSync(join(root, rel))) ok(`file ${rel}`);
  else fail(`manca ${rel}`);
}

const checkoutSrc = readFileSync(
  join(root, "musicpro/apps/web/src/app/api/lezioni/checkout/route.ts"),
  "utf8",
);
const linkSrc = readFileSync(
  join(root, "musicpro/apps/web/src/lib/nexi/lesson-pack-payment-link.ts"),
  "utf8",
);
const mintSrc = readFileSync(
  join(root, "musicpro/apps/web/src/lib/nexi/mint-payment.ts"),
  "utf8",
);
const nexiMig = readFileSync(
  join(root, "supabase/migrations/075_nexi_xpay_payments.sql"),
  "utf8",
);

const checkoutChecks = [
  ["createLessonPackPaymentLink", "checkout → createLessonPackPaymentLink"],
  ["findReusableLessonPackPayment", "checkout riusa pending Nexi se valido"],
  ['method: "nexi"', "checkout registra method=nexi"],
  ["member_quota_ok", "checkout RPC member_quota_ok"],
  ["lesson_family_key", "checkout RPC lesson_family_key"],
  ["ensureOpenPackFee", "checkout ensureOpenPackFee"],
  ["enrollmentId", "checkout body enrollmentId"],
  ["success: true", "checkout risposta success"],
  ["reused: true", "checkout risponde reused su pending riusato"],
];

for (const [needle, label] of checkoutChecks) {
  if (checkoutSrc.includes(needle)) ok(label);
  else fail(`checkout: manca ${needle}`);
}

if (
  linkSrc.includes('flow: "lesson_pack"') &&
  linkSrc.includes("mintNexiPayment") &&
  linkSrc.includes("lessonPackPaymentId")
) {
  ok("lesson-pack-payment-link → mintNexiPayment(lesson_pack)");
} else {
  fail("lesson-pack-payment-link non cablato su Nexi lesson_pack");
}

if (
  linkSrc.includes("findReusableLessonPackPayment") &&
  linkSrc.includes("mp_enrollment_id") &&
  linkSrc.includes("expires_at")
) {
  ok("findReusableLessonPackPayment: enrollment + expires_at");
} else {
  fail("findReusableLessonPackPayment assente o incompleto");
}

if (mintSrc.includes("lesson_pack") && mintSrc.includes("lesson_pack_payment_id")) {
  ok("mint-payment supporta flow lesson_pack + lesson_pack_payment_id");
} else {
  fail("mint-payment senza lesson_pack");
}

if (/api\.stripe\.com|stripe\.checkout\.sessions/i.test(checkoutSrc + linkSrc)) {
  fail("checkout/link ancora chiama Stripe Checkout API");
} else {
  ok("checkout/link senza Stripe Checkout API live");
}

if (
  nexiMig.includes("'lesson_pack'") &&
  nexiMig.includes("apply_stripe_lesson_pack_payment") &&
  nexiMig.includes("lesson_pack_payment_id")
) {
  ok("apply_nexi_payment → apply_stripe_lesson_pack_payment (migration)");
} else {
  fail("migration Nexi senza branch lesson_pack");
}

const rpcNames = [
  "apply_nexi_payment",
  "apply_stripe_lesson_pack_payment",
  "apply_lesson_pack_payment",
];
for (const rpc of rpcNames) {
  if (nexiMig.includes(rpc) || checkoutSrc.includes(rpc)) ok(`RPC/name ${rpc} referenziato`);
  else if (rpc === "apply_lesson_pack_payment") {
    ok(`RPC/name ${rpc} (DB, via stripe apply)`);
  } else fail(`manca riferimento ${rpc}`);
}

const nexiAlias =
  process.env.NEXI_XPAY_ALIAS ??
  env.NEXI_XPAY_ALIAS ??
  process.env.NEXI_ALIAS ??
  env.NEXI_ALIAS;
const nexiMac =
  process.env.NEXI_XPAY_MAC_KEY ??
  env.NEXI_XPAY_MAC_KEY ??
  process.env.NEXI_MAC_KEY ??
  env.NEXI_MAC_KEY;
if (nexiAlias && nexiMac) {
  ok("config Nexi alias+MAC presenti in env (valori non loggati)");
} else {
  skip("config Nexi alias/MAC assenti — ok in CI static; Edge richiede secret in deploy");
}

if (process.exitCode) {
  console.log("\nSmoke static FAILED");
  process.exit(1);
}

if (!supabaseUrl || !serviceKey) {
  console.warn(
    "\nWARN Supabase URL o service role mancanti — SKIP probe/live (exit 0, CI-friendly)",
  );
  console.log("\nSmoke static PASSED");
  process.exit(0);
}

const service = createClient(supabaseUrl, serviceKey);

const probeCod = `MPsmoke${randomBytes(4).toString("hex")}`.slice(0, 30);
const { data: probe, error: probeErr } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: probeCod,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: 100,
});

if (probeErr) {
  fail(`apply_nexi_payment probe: ${probeErr.message}`);
} else if (probe?.success === false && String(probe?.message || "").includes("Ordine Nexi non trovato")) {
  ok("apply_nexi_payment deployata (ordine inesistente → messaggio atteso)");
} else {
  fail(`apply_nexi_payment probe inatteso: ${JSON.stringify(probe)}`);
}

if (!live) {
  console.log(process.exitCode ? "\nSmoke probe FAILED" : "\nSmoke static+probe PASSED");
  process.exit(process.exitCode || 0);
}

console.log("\n— live apply lesson_pack —\n");

async function findPaidEnrollment() {
  const { data: enrollments, error } = await service
    .from("course_enrollments")
    .select("id, member_id, course_id")
    .is("left_at", null)
    .limit(40);
  if (error) throw new Error(error.message);
  for (const e of enrollments ?? []) {
    const { data: course } = await service
      .from("courses")
      .select("id, status, is_trial, price_eur")
      .eq("id", e.course_id)
      .maybeSingle();
    const price = Number(course?.price_eur ?? 0);
    if (
      course?.status === "attivo" &&
      !course?.is_trial &&
      Number.isFinite(price) &&
      price > 0
    ) {
      return { enrollment: e, priceEur: price };
    }
  }
  return null;
}

const found = await findPaidEnrollment();
if (!found) {
  fail("live: nessuna iscrizione su corso attivo a pagamento");
  process.exit(1);
}

const { enrollment, priceEur } = found;
ok(
  `enrollment ${enrollment.id.slice(0, 8)}… corso €${priceEur} member ${enrollment.member_id.slice(0, 8)}…`,
);

const { data: familyKeyRaw, error: fkErr } = await service.rpc("lesson_family_key", {
  p_member_id: enrollment.member_id,
});
if (fkErr) {
  fail(`lesson_family_key: ${fkErr.message}`);
  process.exit(1);
}
const familyKey =
  (familyKeyRaw && String(familyKeyRaw).trim()) || `member:${enrollment.member_id}`;

const amountEur = priceEur;
const amountCents = Math.round(amountEur * 100);

const { data: staff } = await service
  .from("members")
  .select("id")
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();

const { data: packPay, error: payInsErr } = await service
  .from("lesson_pack_payments")
  .insert({
    family_key: familyKey,
    member_id: enrollment.member_id,
    amount_eur: amountEur,
    method: "nexi",
    status: "pending",
    include_quota: false,
    created_by: staff?.id ?? enrollment.member_id,
  })
  .select("id")
  .single();

if (payInsErr || !packPay) {
  fail(`insert lesson_pack_payments: ${payInsErr?.message ?? "nessuna riga"}`);
  process.exit(1);
}
ok(`lesson_pack_payments pending ${packPay.id.slice(0, 8)}…`);

const codTrans = `MP${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.slice(0, 30);
const { error: orderErr } = await service.from("nexi_payment_orders").insert({
  flow: "lesson_pack",
  provider_payment_id: codTrans,
  amount_cents: amountCents,
  status: "pending",
  payment_link_url: `https://school.musicproeventi.it/paga-nexi.html?t=${codTrans}`,
  member_id: enrollment.member_id,
  lesson_pack_payment_id: packPay.id,
  description: "SMOKE lesson pack Nexi",
  metadata: {
    mp_flow: "lesson_pack",
    mp_payment_id: packPay.id,
    mp_enrollment_id: enrollment.id,
    mp_member_id: enrollment.member_id,
    smoke: true,
  },
});

if (orderErr) {
  fail(`insert nexi order: ${orderErr.message}`);
  await service.from("lesson_pack_payments").delete().eq("id", packPay.id);
  process.exit(1);
}
ok(`ordine Nexi lesson_pack pending codTrans=${codTrans}`);

const { data: applied, error: applyErr } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: codTrans,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: amountCents,
});

if (applyErr) fail(`apply_nexi_payment live: ${applyErr.message}`);
else if (!applied?.success) fail(`apply success=false: ${JSON.stringify(applied)}`);
else ok(`apply_nexi_payment flow=${applied.flow} duplicate=${applied.duplicate ?? false}`);

const { data: paidPack } = await service
  .from("lesson_pack_payments")
  .select("status, method, stripe_payment_intent_id")
  .eq("id", packPay.id)
  .maybeSingle();

if (paidPack?.status === "completed" && paidPack.method === "nexi") {
  ok("lesson_pack_payments completed + method=nexi");
} else {
  fail(`pack atteso completed/nexi, ottenuto ${JSON.stringify(paidPack)}`);
}

const { data: again } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: codTrans,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: amountCents,
});
if (again?.duplicate === true || again?.success === true) ok("idempotenza notify");
else fail(`idempotenza: ${JSON.stringify(again)}`);

await service.from("lesson_fee_allocations").delete().eq("payment_id", packPay.id);
await service
  .from("lesson_credit_ledger")
  .delete()
  .eq("lesson_payment_id", packPay.id);
await service.from("nexi_payment_receipts").delete().eq("cod_trans", codTrans);
await service.from("nexi_payment_orders").delete().eq("provider_payment_id", codTrans);
await service.from("lesson_pack_payments").delete().eq("id", packPay.id);
ok("cleanup smoke lesson pack rows");

console.log(process.exitCode ? "\nSmoke live FAILED" : "\nSmoke live PASSED");
process.exit(process.exitCode || 0);
