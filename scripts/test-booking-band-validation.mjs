#!/usr/bin/env node
/**
 * Integration test — error codes band validation in create_booking_safe.
 * Usage: node scripts/test-booking-band-validation.mjs
 */
import {
  createAuthUser,
  createSmokeClients,
  createTestMember,
  currentFiscalYear,
  deleteAuthUser,
  signInClient,
} from "./lib/supabase-smoke.mjs";

const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || "MusicPro2026";
const stamp = Date.now().toString().slice(-8);
const fiscalYear = currentFiscalYear();
const FAKE_BAND_ID = "00000000-0000-0000-0000-000000000099";
const FAKE_ROOM_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_MEMBER_ID = "00000000-0000-0000-0000-000000000002";

let exitCode = 0;
function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  exitCode = 1;
}

const cleanup = {
  authUserId: null,
  memberId: null,
};

const { supabaseUrl, serviceKey, anonKey, service } = createSmokeClients();

console.log("Test — validazione band in create_booking_safe\n");

try {
  // Setup membro autenticato con quota
  ok("Setup membro associato autenticato…");
  const email = `test.booking.band.${stamp}@example.com`;
  const member = await createTestMember(service, {
    email,
    firstName: "Test",
    lastName: `Booking${stamp}`,
    taxCode: `TBB${stamp}X`,
    withQuota: true,
    fiscalYear,
  });
  cleanup.memberId = member.id;

  const authUser = await createAuthUser(supabaseUrl, serviceKey, email, TEST_PASSWORD);
  cleanup.authUserId = authUser.id ?? authUser.user?.id;
  await service
    .from("members")
    .update({ user_id: cleanup.authUserId })
    .eq("id", member.id);

  const { client } = await signInClient(supabaseUrl, anonKey, email, TEST_PASSWORD);
  ok(`   membro ${member.id.slice(0, 8)}… autenticato`);

  const bookingArgs = {
    p_room_id: FAKE_ROOM_ID,
    p_member_id: member.id,
    p_start_at: "2099-12-01T10:00:00.000Z",
    p_end_at: "2099-12-01T12:00:00.000Z",
    p_provi_da_solo: false,
  };

  const { data: settingRow } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "booking_band_required")
    .maybeSingle();
  const bandRequiredDefault = ["true", "1", "yes", "on"].includes(
    (settingRow?.value ?? "false").toLowerCase(),
  );

  // Test 1: band facoltativa → prenotazione singola ammessa (non BAND_REQUIRED)
  ok("1. band facoltativa → prenotazione senza band non è BAND_REQUIRED…");
  await service.from("app_settings").upsert({
    key: "booking_band_required",
    value: "false",
  });

  const { data: soloBooking, error: soloErr } = await client.rpc("create_booking_safe", {
    ...bookingArgs,
    p_band_id: null,
  });

  if (soloErr) {
    fail(`create_booking_safe (solo): ${soloErr.message}`);
  } else if (soloBooking?.error_code === "BAND_REQUIRED") {
    fail("atteso prenotazione singola consentita, ottenuto BAND_REQUIRED");
  } else {
    ok(`   error_code=${soloBooking?.error_code ?? "ok"} (band non obbligatoria)`);
  }

  // Test 2: band obbligatoria → BAND_REQUIRED senza band
  ok("2. band obbligatoria → p_band_id null → BAND_REQUIRED…");
  await service.from("app_settings").upsert({
    key: "booking_band_required",
    value: "true",
  });

  const { data: noBand, error: noBandErr } = await client.rpc("create_booking_safe", {
    ...bookingArgs,
    p_band_id: null,
  });

  if (noBandErr) {
    fail(`create_booking_safe (null band): ${noBandErr.message}`);
  } else if (noBand?.error_code !== "BAND_REQUIRED") {
    fail(`atteso BAND_REQUIRED, ottenuto ${noBand?.error_code ?? JSON.stringify(noBand)}`);
  } else {
    ok("   error_code=BAND_REQUIRED");
  }

  await service.from("app_settings").upsert({
    key: "booking_band_required",
    value: "false",
  });

  // Test 3: fake band_id → NOT_BAND_MEMBER
  ok("3. fake band_id → NOT_BAND_MEMBER…");
  const { data: fakeBand, error: fakeBandErr } = await client.rpc("create_booking_safe", {
    ...bookingArgs,
    p_band_id: FAKE_BAND_ID,
  });

  if (fakeBandErr) {
    fail(`create_booking_safe (fake band): ${fakeBandErr.message}`);
  } else if (
    fakeBand?.error_code !== "NOT_BAND_MEMBER" &&
    fakeBand?.error_code !== "NOT_AUTHENTICATED"
  ) {
    fail(`atteso NOT_BAND_MEMBER/NOT_AUTHENTICATED, ottenuto ${fakeBand?.error_code ?? JSON.stringify(fakeBand)}`);
  } else {
    ok(`   error_code=${fakeBand.error_code}`);
  }

  // Verifica anche con service role (NOT_AUTHENTICATED atteso)
  ok("4. service role → NOT_AUTHENTICATED…");
  const { data: serviceResult, error: serviceErr } = await service.rpc("create_booking_safe", {
    p_room_id: FAKE_ROOM_ID,
    p_member_id: FAKE_MEMBER_ID,
    p_start_at: "2099-12-01T10:00:00.000Z",
    p_end_at: "2099-12-01T12:00:00.000Z",
    p_provi_da_solo: false,
    p_band_id: FAKE_BAND_ID,
  });

  if (serviceErr) {
    fail(`create_booking_safe (service): ${serviceErr.message}`);
  } else if (serviceResult?.error_code !== "NOT_AUTHENTICATED") {
    fail(`atteso NOT_AUTHENTICATED, ottenuto ${serviceResult?.error_code ?? JSON.stringify(serviceResult)}`);
  } else {
    ok("   error_code=NOT_AUTHENTICATED");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  console.log("\nCleanup…");
  if (cleanup.memberId) {
    await service.from("member_annual_quotas").delete().eq("member_id", cleanup.memberId);
    await service.from("member_roles").delete().eq("member_id", cleanup.memberId);
    await service.from("members").delete().eq("id", cleanup.memberId);
  }
  if (cleanup.authUserId) {
    try {
      await deleteAuthUser(supabaseUrl, serviceKey, cleanup.authUserId);
    } catch {
      /* ignore */
    }
  }
  ok("cleanup completato");
}

console.log(exitCode ? "\nTest FAILED" : "\nTest PASSED");
process.exit(exitCode);
