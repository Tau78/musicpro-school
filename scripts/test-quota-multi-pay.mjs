#!/usr/bin/env node
/**
 * Integration test — riconciliazione pagamento quota multiplo (apply_stripe_quota_payment).
 * Usage: node scripts/test-quota-multi-pay.mjs
 *
 * Se migration 025 non è applicata, il test termina con SKIP (exit 0).
 */
import {
  createSmokeClients,
  createTestMember,
  currentFiscalYear,
  rpcMissing,
} from "./lib/supabase-smoke.mjs";

const stamp = Date.now().toString().slice(-8);
const fiscalYear = currentFiscalYear();
const SMOKE_EVENT = `evt_smoke_quota_${Date.now()}`;
const SMOKE_PI = `pi_smoke_quota_${Date.now()}`;

let exitCode = 0;
function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  exitCode = 1;
}
function skip(msg) {
  console.log(`SKIP ${msg}`);
}

const cleanup = {
  memberIds: [],
  quotaPaymentId: null,
  itemIds: [],
};

const { service } = createSmokeClients();

console.log("Test — riconciliazione quota multipla\n");

// 1. Verifica RPC apply_stripe_quota_payment
ok("1. Verifica RPC apply_stripe_quota_payment…");
const probe = await service.rpc("apply_stripe_quota_payment", {
  p_stripe_event_id: "probe",
  p_stripe_event_type: "checkout.session.completed",
  p_payment_intent_id: null,
  p_payment_link_id: null,
  p_amount_cents: 1500,
  p_flow: "quota_multi_pay",
  p_quota_payment_id: "00000000-0000-0000-0000-000000000000",
});

if (rpcMissing(probe.error)) {
  skip("apply_stripe_quota_payment non presente (migration 025?) — test saltato");
  console.log("\nTest SKIPPED (exit 0)");
  process.exit(0);
}

ok("   RPC registrata");

try {
  // 2. Crea payer + beneficiari e quota_payment + items
  ok("2. Setup quota_payment + items…");
  const payer = await createTestMember(service, {
    email: `test.quota.payer.${stamp}@example.com`,
    firstName: "Test",
    lastName: `Payer${stamp}`,
    taxCode: `TQP${stamp}P`,
    withQuota: false,
    fiscalYear,
  });
  cleanup.memberIds.push(payer.id);

  const beneficiaryA = await createTestMember(service, {
    email: `test.quota.ben.a.${stamp}@example.com`,
    firstName: "Test",
    lastName: `BenA${stamp}`,
    taxCode: `TQA${stamp}A`,
    withQuota: false,
    fiscalYear,
  });
  cleanup.memberIds.push(beneficiaryA.id);

  const beneficiaryB = await createTestMember(service, {
    email: `test.quota.ben.b.${stamp}@example.com`,
    firstName: "Test",
    lastName: `BenB${stamp}`,
    taxCode: `TQB${stamp}B`,
    withQuota: false,
    fiscalYear,
  });
  cleanup.memberIds.push(beneficiaryB.id);

  const amountA = 15;
  const amountB = 15;
  const total = amountA + amountB;

  const { data: payment, error: payErr } = await service
    .from("quota_payments")
    .insert({
      paid_by_member_id: payer.id,
      stripe_payment_intent_id: null,
      total_amount_eur: total,
      fiscal_year: fiscalYear,
    })
    .select("id")
    .single();

  if (payErr) throw new Error(`quota_payments insert: ${payErr.message}`);
  cleanup.quotaPaymentId = payment.id;

  const items = [
    {
      quota_payment_id: payment.id,
      member_id: beneficiaryA.id,
      amount_eur: amountA,
      fiscal_year: fiscalYear,
      paid_by_member_id: payer.id,
      status: "pending",
    },
    {
      quota_payment_id: payment.id,
      member_id: beneficiaryB.id,
      amount_eur: amountB,
      fiscal_year: fiscalYear,
      paid_by_member_id: payer.id,
      status: "pending",
    },
  ];

  const { data: insertedItems, error: itemsErr } = await service
    .from("quota_payment_items")
    .insert(items)
    .select("id, member_id, status");

  if (itemsErr) throw new Error(`quota_payment_items insert: ${itemsErr.message}`);
  cleanup.itemIds = insertedItems.map((row) => row.id);
  ok(`   payment ${payment.id.slice(0, 8)}… — ${insertedItems.length} items pending`);

  // 3. apply_stripe_quota_payment
  ok("3. apply_stripe_quota_payment…");
  const { data: applied, error: rpcErr } = await service.rpc("apply_stripe_quota_payment", {
    p_stripe_event_id: SMOKE_EVENT,
    p_stripe_event_type: "checkout.session.completed",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: Math.round(total * 100),
    p_flow: "quota_multi_pay",
    p_quota_payment_id: payment.id,
  });

  if (rpcErr) {
    fail(`apply_stripe_quota_payment: ${rpcErr.message}`);
  } else if (!applied?.success) {
    fail(`RPC success=false: ${applied?.message ?? JSON.stringify(applied)}`);
  } else {
    ok(`   RPC apply — ${applied.message ?? "ok"}`);
  }

  // 4. Verifica member_annual_quotas + items completed
  ok("4. Verifica member_annual_quotas e items completed…");
  for (const memberId of [beneficiaryA.id, beneficiaryB.id]) {
    const { data: quota } = await service
      .from("member_annual_quotas")
      .select("paid_at, amount_paid_eur")
      .eq("member_id", memberId)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle();

    if (!quota?.paid_at) {
      fail(`member_annual_quotas — quota non registrata per ${memberId.slice(0, 8)}…`);
    }
  }

  const { data: finalItems } = await service
    .from("quota_payment_items")
    .select("id, status")
    .in("id", cleanup.itemIds);

  const allCompleted = (finalItems ?? []).every((row) => row.status === "completed");
  if (!allCompleted) {
    fail(
      `quota_payment_items — atteso completed, ottenuto ${JSON.stringify(finalItems?.map((r) => r.status))}`,
    );
  } else {
    ok(`   ${finalItems.length} items completed, quote annuali aggiornate`);
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  console.log("\nCleanup…");
  if (cleanup.itemIds.length) {
    await service.from("quota_payment_items").delete().in("id", cleanup.itemIds);
  }
  if (cleanup.quotaPaymentId) {
    await service.from("quota_payments").delete().eq("id", cleanup.quotaPaymentId);
  }
  for (const memberId of cleanup.memberIds) {
    await service.from("member_annual_quotas").delete().eq("member_id", memberId);
    await service.from("member_roles").delete().eq("member_id", memberId);
    await service.from("members").delete().eq("id", memberId);
  }
  ok("cleanup completato");
}

console.log(exitCode ? "\nTest FAILED" : "\nTest PASSED");
process.exit(exitCode);
