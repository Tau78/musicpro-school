#!/usr/bin/env node
/**
 * Smoke lezioni — wallet pacchetto alla 4ª presenza, Nexi checkout, account test.
 *
 *   node scripts/smoke-lessons-pack-wallet.mjs
 *   node scripts/smoke-lessons-pack-wallet.mjs --live
 *
 * --live: verifica DB (member test, sync SQL, retta aperta su corso test).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");
const TEST_EMAIL = "mauro.andreoni@gmail.com";

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

console.log("Smoke — lezioni pacchetto / wallet / Nexi\n");

const staticChecks = [
  "supabase/migrations/095_member_test_account_flag.sql",
  "supabase/migrations/096_sandbox_lesson_room.sql",
  "supabase/migrations/097_lesson_wallet_pack_at_zero.sql",
  "supabase/migrations/098_fiscal_receipt_test_section.sql",
  "musicpro/apps/web/src/lib/nexi/lesson-pack-payment-link.ts",
  "musicpro/apps/web/src/app/api/lezioni/pack-payment/request/route.ts",
  "musicpro/apps/web/src/app/api/lezioni/checkout/route.ts",
  "docs/LEZIONI_CHECKLIST_TEST.md",
];

for (const rel of staticChecks) {
  if (existsSync(join(root, rel))) ok(`file ${rel}`);
  else fail(`manca ${rel}`);
}

const syncSql = readFileSync(
  join(root, "supabase/migrations/097_lesson_wallet_pack_at_zero.sql"),
  "utf8",
);
if (
  syncSql.includes("v_balance <= 0") &&
  syncSql.includes("pack_opened_enrollment_ids")
) {
  ok("sync wallet: retta a saldo 0 + enrollment ids");
} else {
  fail("sync wallet incompleto in 097");
}

const checkoutSrc = readFileSync(
  join(root, "musicpro/apps/web/src/app/api/lezioni/checkout/route.ts"),
  "utf8",
);
if (
  checkoutSrc.includes("lib/nexi/lesson-pack-payment-link") &&
  !checkoutSrc.includes('from "@/lib/stripe/')
) {
  ok("checkout pacchetto usa Nexi (no import stripe)");
} else {
  fail("checkout pacchetto non allineato a Nexi");
}

const nexiApply = readFileSync(
  join(root, "supabase/migrations/075_nexi_xpay_payments.sql"),
  "utf8",
);
if (nexiApply.includes("'lesson_pack'")) {
  ok("apply_nexi_payment: flow lesson_pack");
} else {
  fail("lesson_pack assente in migration Nexi");
}

const memberUi = readFileSync(
  join(root, "musicpro/apps/web/src/components/admin/member-quick-edit.tsx"),
  "utf8",
);
if (memberUi.includes("isTestAccount") && memberUi.includes("Account test")) {
  ok("UI flag account test in rubrica");
} else {
  fail("member-quick-edit senza flag account test");
}

const receipts = readFileSync(
  join(root, "musicpro/packages/database/src/lessons-receipts.ts"),
  "utf8",
);
if (receipts.includes("TEST") && receipts.includes("is_test_account")) {
  ok("ricevute: sezionale TEST per account test");
} else {
  fail("lessons-receipts senza sezionale TEST");
}

const stripeDir = join(root, "musicpro/apps/web/src/lib/stripe");
if (existsSync(stripeDir)) {
  fail("cartella lib/stripe ancora presente (solo Nexi)");
} else {
  ok("web: nessuna cartella lib/stripe");
}

if (!live) {
  skip("live: aggiungi --live per verificare member test e retta pack");
  process.exit(exitCode());
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  fail("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const service = createClient(url, key);

const { data: member, error: memberErr } = await service
  .from("members")
  .select("id, email, is_test_account")
  .ilike("email", TEST_EMAIL)
  .maybeSingle();

if (memberErr || !member) {
  fail(`Member test ${TEST_EMAIL} non trovato`);
  process.exit(1);
}
if (!member.is_test_account) {
  fail(`${TEST_EMAIL} non ha is_test_account=true (migration 095)`);
} else {
  ok(`account test ${TEST_EMAIL}`);
}

const { data: enrollments } = await service
  .from("course_enrollments")
  .select("id, course_id, left_at")
  .eq("member_id", member.id)
  .is("left_at", null)
  .limit(5);

const enrollment = (enrollments ?? [])[0];
if (!enrollment) {
  skip("nessun corso attivo per allievo test — crea corso test (checklist)");
  process.exit(exitCode());
}

const { count: openPackFees } = await service
  .from("lesson_fees")
  .select("id", { count: "exact", head: true })
  .eq("course_enrollment_id", enrollment.id)
  .eq("kind", "pack")
  .in("status", ["aperta", "parziale"]);

ok(
  `corso test enrollment ${enrollment.id} — rette pack aperte: ${openPackFees ?? 0}`,
);

function exitCode() {
  return process.exitCode ?? 0;
}
