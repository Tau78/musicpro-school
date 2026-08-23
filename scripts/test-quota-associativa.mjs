#!/usr/bin/env node
/**
 * Integration test — riconciliazione quota associativa onboarding (apply_stripe_quota_payment).
 * Usage: node scripts/test-quota-associativa.mjs
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
const SMOKE_EVENT = `evt_smoke_quota_assoc_${Date.now()}`;
const SMOKE_PI = `pi_smoke_quota_assoc_${Date.now()}`;
const amountCents = 1500;

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
  memberId: null,
  enrollmentId: null,
  receiptEventIds: [],
};

const { service } = createSmokeClients();

console.log("Test — riconciliazione quota associativa\n");

ok("1. Verifica RPC apply_stripe_quota_payment…");
const probe = await service.rpc("apply_stripe_quota_payment", {
  p_stripe_event_id: "probe",
  p_stripe_event_type: "checkout.session.completed",
  p_payment_intent_id: null,
  p_payment_link_id: null,
  p_amount_cents: amountCents,
  p_flow: "quota_associativa",
  p_enrollment_id: "00000000-0000-0000-0000-000000000000",
});

if (rpcMissing(probe.error)) {
  skip("apply_stripe_quota_payment non presente (migration 025?) — test saltato");
  console.log("\nTest SKIPPED (exit 0)");
  process.exit(0);
}

ok("   RPC registrata");

try {
  ok("2. Setup enrollment + member…");
  const member = await createTestMember(service, {
    email: `test.quota.assoc.${stamp}@example.com`,
    firstName: "Test",
    lastName: `QuotaAssoc${stamp}`,
    taxCode: `TQA${stamp}Z`,
    withQuota: false,
    fiscalYear,
  });
  cleanup.memberId = member.id;

  const { data: enrollment, error: enrollErr } = await service
    .from("enrollments")
    .insert({
      member_id: member.id,
      first_name: "Test",
      last_name: `QuotaAssoc${stamp}`,
      email: member.email,
      tax_code: `TQA${stamp}Z`,
      fiscal_year: fiscalYear,
      amount_centesimi: amountCents,
      payment_status: "pending",
    })
    .select("id, payment_status")
    .single();

  if (enrollErr) throw new Error(`enrollments insert: ${enrollErr.message}`);
  cleanup.enrollmentId = enrollment.id;
  ok(`   enrollment ${enrollment.id.slice(0, 8)}… — payment_status=${enrollment.payment_status}`);

  ok("3. apply_stripe_quota_payment…");
  const { data: applied, error: rpcErr } = await service.rpc("apply_stripe_quota_payment", {
    p_stripe_event_id: SMOKE_EVENT,
    p_stripe_event_type: "checkout.session.completed",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: amountCents,
    p_flow: "quota_associativa",
    p_enrollment_id: enrollment.id,
  });

  if (rpcErr) {
    fail(`apply_stripe_quota_payment: ${rpcErr.message}`);
  } else if (!applied?.success) {
    fail(`RPC success=false: ${applied?.message ?? JSON.stringify(applied)}`);
  } else {
    ok(`   RPC apply — member ${String(applied.member_id ?? "").slice(0, 8)}…`);
  }

  cleanup.receiptEventIds.push(SMOKE_EVENT);

  ok("4. Verifica enrollment PAGATO e member_annual_quotas…");
  const { data: paidEnrollment } = await service
    .from("enrollments")
    .select("payment_status, paid_at, stripe_payment_intent_id")
    .eq("id", enrollment.id)
    .maybeSingle();

  if (String(paidEnrollment?.payment_status ?? "").toUpperCase() !== "PAGATO") {
    fail(
      `enrollment — atteso PAGATO, ottenuto ${paidEnrollment?.payment_status ?? "null"}`,
    );
  } else if (!paidEnrollment?.paid_at) {
    fail("enrollment — paid_at mancante");
  } else if (paidEnrollment.stripe_payment_intent_id !== SMOKE_PI) {
    fail(`enrollment — pi atteso ${SMOKE_PI}, ottenuto ${paidEnrollment.stripe_payment_intent_id ?? "null"}`);
  } else {
    ok(`   enrollment PAGATO paid_at=${paidEnrollment.paid_at.slice(0, 10)}`);
  }

  const { data: quota } = await service
    .from("member_annual_quotas")
    .select("paid_at, amount_paid_eur")
    .eq("member_id", member.id)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();

  if (!quota?.paid_at) {
    fail("member_annual_quotas — quota non registrata");
  } else {
    ok(`   member_annual_quotas — paid_at=${quota.paid_at.slice(0, 10)} amount=${quota.amount_paid_eur}`);
  }

  ok("5. Idempotenza (stesso payment_intent_id)…");
  const { data: again, error: againErr } = await service.rpc("apply_stripe_quota_payment", {
    p_stripe_event_id: `${SMOKE_EVENT}_retry`,
    p_stripe_event_type: "payment_intent.succeeded",
    p_payment_intent_id: SMOKE_PI,
    p_payment_link_id: null,
    p_amount_cents: amountCents,
    p_flow: "quota_associativa",
    p_enrollment_id: enrollment.id,
  });

  if (againErr) {
    fail(`idempotenza RPC: ${againErr.message}`);
  } else if (again?.duplicate === true) {
    ok("   duplicate=true, nessun doppio update");
  } else {
    fail(`idempotenza attesa duplicate=true, ottenuto ${JSON.stringify(again)}`);
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  console.log("\nCleanup…");
  if (cleanup.receiptEventIds.length) {
    await service
      .from("stripe_quota_payment_receipts")
      .delete()
      .in("stripe_event_id", cleanup.receiptEventIds);
    await service.from("stripe_quota_payment_receipts").delete().eq("payment_intent_id", SMOKE_PI);
  }
  if (cleanup.enrollmentId) {
    await service.from("enrollments").delete().eq("id", cleanup.enrollmentId);
  }
  if (cleanup.memberId) {
    await service.from("member_annual_quotas").delete().eq("member_id", cleanup.memberId);
    await service.from("member_roles").delete().eq("member_id", cleanup.memberId);
    await service.from("members").delete().eq("id", cleanup.memberId);
  }
  ok("cleanup completato");
}

console.log(exitCode ? "\nTest FAILED" : "\nTest PASSED");
process.exit(exitCode);
