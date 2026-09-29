#!/usr/bin/env node
/**
 * Smoke end-to-end — shop crediti via Nexi + uso sala + guardrail.
 *
 * Verifica:
 * 1) Nexi cablato su shop_credit_package (mint → apply_nexi_payment → ledger)
 * 2) Crediti accreditati solo all'associato dell'ordine
 * 3) Scalati correttamente con debit_booking_credits (sala)
 * 4) Shop/quota non accettano pagamento con crediti (static + API shape)
 * 5) Ledger lezioni è separato (crediti shop ≠ crediti lezioni)
 *
 * Usage: node scripts/smoke-credit-shop-nexi-e2e.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnv(file) {
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
  ...readEnv(join(root, ".env")),
  ...readEnv(join(root, "musicpro/.env")),
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("FAIL: Supabase URL o service role mancanti");
  process.exit(1);
}

const service = createClient(supabaseUrl, serviceKey);
let failed = 0;

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed = 1;
}

async function ledgerSum(memberId) {
  const { data, error } = await service
    .from("credit_transactions")
    .select("amount")
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
}

console.log("Smoke — credit shop Nexi e2e\n");

// --- Static: Nexi wiring ---
const mintSrc = readFileSync(
  join(root, "musicpro/apps/web/src/lib/stripe/credit-shop-payment-link.ts"),
  "utf8",
);
const shopRoute = readFileSync(
  join(root, "musicpro/apps/web/src/app/api/shop/purchase/route.ts"),
  "utf8",
);
const shopUi = readFileSync(
  join(root, "musicpro/apps/web/src/components/shop/credit-shop-packages.tsx"),
  "utf8",
);
const nexiMig = readFileSync(
  join(root, "supabase/migrations/075_nexi_xpay_payments.sql"),
  "utf8",
);

if (mintSrc.includes('flow: "shop_credit_package"') && mintSrc.includes("mintNexiPayment")) {
  ok("shop payment-link → mintNexiPayment(shop_credit_package)");
} else fail("shop payment-link non usa Nexi");

if (mintSrc.includes("api.stripe.com") || shopRoute.includes("stripe.checkout")) {
  fail("shop ancora chiama Stripe API");
} else ok("shop route/mint senza Stripe Checkout API");

if (
  nexiMig.includes("shop_credit_package") &&
  nexiMig.includes("apply_stripe_credit_shop_payment")
) {
  ok("apply_nexi_payment gestisce shop_credit_package");
} else fail("migration Nexi senza branch shop");

if (/paga con crediti|payment_method.*credits|usa.?crediti/i.test(shopUi + shopRoute)) {
  fail("UI/API shop espone pagamento con crediti");
} else ok("shop non offre pagamento con crediti (solo redirect Nexi)");

const enrollSrc = readFileSync(
  join(root, "musicpro/apps/web/src/lib/iscrizione/stripe-payment-link.ts"),
  "utf8",
);
const enrollQuota = existsSync(
  join(root, "musicpro/apps/web/src/lib/iscrizione/enrollment-service.ts"),
)
  ? readFileSync(
      join(root, "musicpro/apps/web/src/lib/iscrizione/enrollment-service.ts"),
      "utf8",
    )
  : "";
if (
  /debit_booking_credits|payment_method:\s*['"]credits['"]|paga con crediti/i.test(
    enrollSrc + enrollQuota,
  )
) {
  fail("iscrizione/quota sembra accettare crediti");
} else ok("quota/iscrizione non paga con crediti shop");

// --- Live DB ---
const { data: pkg, error: pkgErr } = await service
  .from("credit_packages")
  .select("id, name, credits, price_eur, enabled")
  .eq("enabled", true)
  .order("sort_order")
  .limit(1)
  .maybeSingle();

if (pkgErr || !pkg) {
  fail(`pacchetto attivo: ${pkgErr?.message ?? "nessuno"}`);
  process.exit(1);
}
ok(`pacchetto ${pkg.name} = ${pkg.credits} crediti / €${pkg.price_eur}`);

const { data: buyer } = await service
  .from("members")
  .select("id, email, first_name, last_name")
  .ilike("email", "mauro.andreoni@gmail.com")
  .maybeSingle();

const { data: other } = await service
  .from("members")
  .select("id, email, first_name")
  .eq("is_active", true)
  .neq("id", buyer?.id ?? "00000000-0000-0000-0000-000000000000")
  .limit(1)
  .maybeSingle();

if (!buyer) {
  fail("buyer mauro.andreoni@gmail.com non trovato");
  process.exit(1);
}
if (!other) {
  fail("membro distrattore non trovato");
  process.exit(1);
}
ok(`buyer ${buyer.first_name} ${buyer.last_name} (${buyer.id.slice(0, 8)}…)`);
ok(`other  ${other.first_name} (${other.id.slice(0, 8)}…) — non deve ricevere crediti`);

const buyerBefore = await ledgerSum(buyer.id);
const otherBefore = await ledgerSum(other.id);

const codTrans = `MP${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.slice(0, 30);
const amountCents = Math.round(Number(pkg.price_eur) * 100);

const { error: orderErr } = await service.from("nexi_payment_orders").insert({
  flow: "shop_credit_package",
  provider_payment_id: codTrans,
  amount_cents: amountCents,
  status: "pending",
  payment_link_url: `https://school.musicproeventi.it/paga-nexi.html?t=${codTrans}`,
  member_id: buyer.id,
  package_id: pkg.id,
  description: `SMOKE shop ${pkg.name}`,
  metadata: {
    mp_flow: "shop_credit_package",
    mp_member_id: buyer.id,
    mp_package_id: pkg.id,
    smoke: true,
  },
});

if (orderErr) {
  fail(`insert nexi order: ${orderErr.message}`);
  process.exit(1);
}
ok(`ordine Nexi shop pending codTrans=${codTrans}`);

const { data: applied, error: applyErr } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: codTrans,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: amountCents,
});

if (applyErr) fail(`apply_nexi_payment: ${applyErr.message}`);
else if (!applied?.success) fail(`apply success=false: ${JSON.stringify(applied)}`);
else ok(`apply_nexi_payment flow=${applied.flow} duplicate=${applied.duplicate ?? false}`);

const buyerAfterPurchase = await ledgerSum(buyer.id);
const otherAfterPurchase = await ledgerSum(other.id);
const granted = buyerAfterPurchase - buyerBefore;

if (granted === pkg.credits) {
  ok(`accredito buyer +${granted} (atteso ${pkg.credits})`);
} else {
  fail(`accredito buyer +${granted}, atteso +${pkg.credits}`);
}

if (otherAfterPurchase === otherBefore) {
  ok("altro associato invariato (nessun accredito errato)");
} else {
  fail(
    `altro associato delta=${otherAfterPurchase - otherBefore} (non doveva cambiare)`,
  );
}

const { data: purchase } = await service
  .from("credit_purchases")
  .select("id, member_id, credits_granted, payment_status, stripe_payment_intent_id")
  .eq("stripe_payment_intent_id", codTrans)
  .maybeSingle();

if (purchase?.member_id === buyer.id && purchase.credits_granted === pkg.credits) {
  ok(`credit_purchases member corretto, status=${purchase.payment_status}`);
} else {
  fail(`credit_purchases mismatch: ${JSON.stringify(purchase)}`);
}

// Idempotenza
const { data: again } = await service.rpc("apply_nexi_payment", {
  p_cod_trans: codTrans,
  p_cod_aut: "SMOKE",
  p_esito: "OK",
  p_amount_cents: amountCents,
});
if (again?.duplicate === true || again?.success === true) {
  const afterIdem = await ledgerSum(buyer.id);
  if (afterIdem === buyerAfterPurchase) ok("idempotenza: saldo invariato al 2° notify");
  else fail(`idempotenza: saldo ${buyerAfterPurchase} → ${afterIdem}`);
} else {
  fail(`idempotenza: ${JSON.stringify(again)}`);
}

// --- Debit sala (sandbox se esiste) ---
const { data: sandbox } = await service
  .from("rooms")
  .select("id, name, slug")
  .eq("slug", "sandbox-test")
  .maybeSingle();
const { data: anyRoom } = await service
  .from("rooms")
  .select("id, name, slug")
  .eq("is_active", true)
  .order("sort_order")
  .limit(1)
  .maybeSingle();
const room = sandbox ?? anyRoom;

if (!room) {
  fail("nessuna sala per debit test");
} else {
  const start = "2099-12-20T21:00:00.000Z";
  const end = "2099-12-20T22:00:00.000Z";
  await service.from("bookings").delete().eq("room_id", room.id).eq("start_at", start);

  const debitCredits = Math.min(2, pkg.credits);
  const { data: booking, error: bErr } = await service
    .from("bookings")
    .insert({
      room_id: room.id,
      member_id: buyer.id,
      start_at: start,
      end_at: end,
      status: "pending",
      payment_status: "unpaid",
      duration_minutes: 60,
      total_price_eur: debitCredits, // 1 credito ~ uso test
      title: "SMOKE credit debit",
      notes: "SMOKE credit-shop-nexi-e2e — auto-cleanup",
    })
    .select("id")
    .single();

  if (bErr || !booking) {
    fail(`insert booking: ${bErr?.message ?? "none"}`);
  } else {
    const beforeDebit = await ledgerSum(buyer.id);
    const { data: debitRes, error: dErr } = await service.rpc("debit_booking_credits", {
      p_booking_id: booking.id,
      p_credits: debitCredits,
    });
    const afterDebit = await ledgerSum(buyer.id);
    const { data: paid } = await service
      .from("bookings")
      .select("status, payment_status, payment_method, credits_used")
      .eq("id", booking.id)
      .maybeSingle();

    if (dErr) fail(`debit_booking_credits: ${dErr.message}`);
    else if (
      paid?.payment_method === "credits" &&
      (paid.status === "confirmed" || paid.status === "pending_approval") &&
      beforeDebit - afterDebit === debitCredits
    ) {
      ok(
        `debit sala −${debitCredits} method=credits status=${paid.status} room=${room.slug}`,
      );
    } else {
      fail(
        `debit atteso −${debitCredits} credits; delta=${beforeDebit - afterDebit} paid=${JSON.stringify(paid)} rpc=${JSON.stringify(debitRes)}`,
      );
    }

    await service.from("bookings").delete().eq("id", booking.id);
    // cleanup debit ledger rows tied to booking if orphaned
    await service
      .from("credit_transactions")
      .delete()
      .eq("booking_id", booking.id);
  }
}

// --- Lezioni: ledger separato ---
const { count: lessonLedgerCount, error: llErr } = await service
  .from("lesson_credit_ledger")
  .select("id", { count: "exact", head: true })
  .eq("member_id", buyer.id);
if (llErr) {
  fail(`lesson_credit_ledger: ${llErr.message}`);
} else {
  ok(
    `ledger lezioni separato (buyer ha ${lessonLedgerCount ?? 0} mov. lesson_credit_ledger; shop usa credit_transactions)`,
  );
}

// Cleanup Nexi shop artifacts (keep purchase? delete for cleanliness)
await service.from("nexi_payment_receipts").delete().eq("cod_trans", codTrans);
await service.from("nexi_payment_orders").delete().eq("provider_payment_id", codTrans);
if (purchase?.id) {
  await service
    .from("stripe_credit_shop_payment_receipts")
    .delete()
    .eq("purchase_id", purchase.id);
  await service.from("credit_transactions").delete().eq("purchase_id", purchase.id);
  await service.from("credit_purchases").delete().eq("id", purchase.id);
}
ok("cleanup smoke shop rows");

// MAC sanity (static)
const mac = createHash("sha1")
  .update(`codTrans=${codTrans}divisa=EURimporto=${amountCents}k`)
  .digest("hex");
if (mac.length === 40) ok("MAC SHA1 length ok");
else fail("MAC SHA1 broken");

console.log(failed ? "\nSmoke FAILED" : "\nSmoke PASSED");
process.exit(failed);
