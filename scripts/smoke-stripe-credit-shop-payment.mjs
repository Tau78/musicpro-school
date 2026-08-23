#!/usr/bin/env node
/**
 * Smoke test — path pagamento SHOP crediti (RPC apply_stripe_credit_shop_payment).
 * Crea acquisto temporaneo via RPC, verifica idempotenza, pulisce.
 *
 * Usage: node scripts/smoke-stripe-credit-shop-payment.mjs
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

const SMOKE_PI = `pi_smoke_credit_shop_${Date.now()}`;
const SMOKE_EVENT = `evt_smoke_credit_shop_${Date.now()}`;

console.log("Smoke test — Stripe SHOP crediti payment RPC\n");

const { data: pkg, error: pkgErr } = await service
  .from("credit_packages")
  .select("id, name, credits, price_eur")
  .eq("enabled", true)
  .order("sort_order")
  .limit(1)
  .maybeSingle();

if (pkgErr || !pkg) {
  fail(`pacchetto crediti attivo: ${pkgErr?.message ?? "nessuno"}`);
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

const { data: applied, error: rpcErr } = await service.rpc(
  "apply_stripe_credit_shop_payment",
  {
    p_member_ref: member.id,
    p_package_id: pkg.id,
    p_stripe_event_id: SMOKE_EVENT,
    p_stripe_event_type: "checkout.session.completed",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: Math.round(Number(pkg.price_eur) * 100),
  },
);

if (rpcErr) {
  fail(`apply_stripe_credit_shop_payment: ${rpcErr.message}`);
} else if (!applied?.success) {
  fail(`RPC success=false: ${applied?.message ?? JSON.stringify(applied)}`);
} else {
  ok(
    `RPC apply — purchase=${String(applied.purchase_id ?? "").slice(0, 8)}… credits=${applied.credits_granted ?? "?"}`,
  );
}

const purchaseId = applied?.purchase_id;

const { data: purchase } = await service
  .from("credit_purchases")
  .select("payment_status, credits_granted, stripe_payment_intent_id")
  .eq("id", purchaseId)
  .maybeSingle();

if (purchase?.payment_status === "paid" && purchase.stripe_payment_intent_id === SMOKE_PI) {
  ok(`DB — credit_purchases paid pi=${purchase.stripe_payment_intent_id ? "set" : "missing"}`);
} else {
  fail(
    `DB atteso paid/${SMOKE_PI}, ottenuto ${purchase?.payment_status}/${purchase?.stripe_payment_intent_id ?? "null"}`,
  );
}

const { data: tx } = await service
  .from("credit_transactions")
  .select("amount, type, purchase_id")
  .eq("purchase_id", purchaseId)
  .maybeSingle();

if (tx?.type === "purchase" && tx.amount === pkg.credits) {
  ok(`DB — credit_transactions purchase +${tx.amount} crediti`);
} else {
  fail(
    `DB atteso purchase/+${pkg.credits}, ottenuto ${tx?.type ?? "null"}/${tx?.amount ?? "null"}`,
  );
}

const { data: again, error: againErr } = await service.rpc(
  "apply_stripe_credit_shop_payment",
  {
    p_member_ref: member.id,
    p_package_id: pkg.id,
    p_stripe_event_id: `${SMOKE_EVENT}_retry`,
    p_stripe_event_type: "payment_intent.succeeded",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: Math.round(Number(pkg.price_eur) * 100),
  },
);

if (againErr) fail(`idempotenza RPC: ${againErr.message}`);
else if (again?.duplicate === true) ok("idempotenza — duplicate=true, nessun doppio accredito");
else fail(`idempotenza attesa duplicate=true, ottenuto ${JSON.stringify(again)}`);

if (purchaseId) {
  await service
    .from("stripe_credit_shop_payment_receipts")
    .delete()
    .eq("payment_intent_id", SMOKE_PI);
  await service.from("credit_transactions").delete().eq("purchase_id", purchaseId);
  const { error: delPurchaseErr } = await service
    .from("credit_purchases")
    .delete()
    .eq("id", purchaseId);

  if (delPurchaseErr) {
    fail(`cleanup delete purchase: ${delPurchaseErr.message}`);
  } else {
    ok("cleanup — purchase smoke rimosso");
  }
}

console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test PASSED");
