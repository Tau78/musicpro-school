#!/usr/bin/env node
/**
 * E2E integration test — flusso invito band (senza browser).
 * Usage: node scripts/test-band-invite-flow.mjs
 */
import { randomBytes } from "node:crypto";

import {
  authApi,
  createAuthUser,
  createSmokeClients,
  createTestMember,
  currentFiscalYear,
  deleteAuthUser,
  ensureMemberQuota,
  signInClient,
} from "./lib/supabase-smoke.mjs";

const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || "MusicPro2026";
const stamp = Date.now().toString().slice(-8);
const fiscalYear = currentFiscalYear();

const emailA = `test.band.founder.${stamp}@example.com`;
const emailB = `test.band.invitee.${stamp}@example.com`;

let exitCode = 0;
function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  exitCode = 1;
}

const cleanup = {
  authUserIds: [],
  memberIds: [],
  bandId: null,
  inviteId: null,
};

const { supabaseUrl, serviceKey, anonKey, service } = createSmokeClients();

console.log("Test E2E — flusso invito band\n");

try {
  // 1. Membro A (founder) con quota pagata
  ok("1. Creazione membro founder A con quota…");
  const memberA = await createTestMember(service, {
    email: emailA,
    firstName: "Test",
    lastName: `Founder${stamp}`,
    taxCode: `TBF${stamp}A`,
    withQuota: true,
    fiscalYear,
  });
  cleanup.memberIds.push(memberA.id);

  const authA = await createAuthUser(supabaseUrl, serviceKey, emailA, TEST_PASSWORD);
  cleanup.authUserIds.push(authA.id ?? authA.user?.id);
  const userIdA = authA.id ?? authA.user?.id;
  await authApi(supabaseUrl, serviceKey, "PATCH", `/rest/v1/members?id=eq.${memberA.id}`, {
    user_id: userIdA,
  });
  ok(`   membro A ${memberA.id.slice(0, 8)}… quota ${fiscalYear} ok`);

  // 2. create_band_safe come A
  ok("2. create_band_safe come founder A…");
  const { client: clientA } = await signInClient(supabaseUrl, anonKey, emailA, TEST_PASSWORD);
  const bandName = `__test_band_${stamp}__`;
  const { data: createBandData, error: createBandErr } = await clientA.rpc("create_band_safe", {
    p_name: bandName,
  });

  if (createBandErr) {
    fail(`create_band_safe: ${createBandErr.message}`);
  } else if (!createBandData?.success) {
    fail(
      `create_band_safe: ${createBandData?.error_code ?? "?"} — ${createBandData?.error_message ?? ""}`,
    );
  } else {
    cleanup.bandId = createBandData.band_id;
    ok(`   band creata ${cleanup.bandId.slice(0, 8)}… (${bandName})`);
  }

  if (!cleanup.bandId) {
    throw new Error("Band non creata — interruzione test");
  }

  // 3. Invito per email B
  ok("3. Creazione band_invite per membro B…");
  const inviteToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invite, error: inviteErr } = await service
    .from("band_invites")
    .insert({
      band_id: cleanup.bandId,
      email: emailB,
      token: inviteToken,
      status: "pending",
      expires_at: expiresAt,
      invited_by_member_id: memberA.id,
    })
    .select("id, token")
    .single();

  if (inviteErr) {
    fail(`band_invites insert: ${inviteErr.message}`);
  } else {
    cleanup.inviteId = invite.id;
    ok(`   invito ${invite.id.slice(0, 8)}… → ${emailB}`);
  }

  // 4. Membro B senza quota (per testare pending_quota)
  ok("4. Creazione membro invitato B (senza quota)…");
  const memberB = await createTestMember(service, {
    email: emailB,
    firstName: "Test",
    lastName: `Invitee${stamp}`,
    taxCode: `TBI${stamp}B`,
    withQuota: false,
    fiscalYear,
  });
  cleanup.memberIds.push(memberB.id);

  const authB = await createAuthUser(supabaseUrl, serviceKey, emailB, TEST_PASSWORD);
  cleanup.authUserIds.push(authB.id ?? authB.user?.id);
  const userIdB = authB.id ?? authB.user?.id;
  await authApi(supabaseUrl, serviceKey, "PATCH", `/rest/v1/members?id=eq.${memberB.id}`, {
    user_id: userIdB,
  });
  ok(`   membro B ${memberB.id.slice(0, 8)}… collegato ad auth`);

  // 5. accept_band_invite come B
  ok("5. accept_band_invite come membro B…");
  const { client: clientB } = await signInClient(supabaseUrl, anonKey, emailB, TEST_PASSWORD);
  const { data: acceptData, error: acceptErr } = await clientB.rpc("accept_band_invite", {
    p_token: inviteToken,
  });

  if (acceptErr) {
    fail(`accept_band_invite: ${acceptErr.message}`);
  } else if (!acceptData?.success) {
    fail(
      `accept_band_invite: ${acceptData?.error_code ?? "?"} — ${acceptData?.error_message ?? ""}`,
    );
  } else {
    ok(
      `   invito accettato — status=${acceptData.member_status ?? "?"} band=${acceptData.band_id?.slice(0, 8) ?? "?"}…`,
    );
  }

  // 6. Verifica band_members
  ok("6. Verifica riga band_members per B…");
  const { data: membership, error: memberErr } = await service
    .from("band_members")
    .select("status, role")
    .eq("band_id", cleanup.bandId)
    .eq("member_id", memberB.id)
    .maybeSingle();

  if (memberErr) {
    fail(`band_members select: ${memberErr.message}`);
  } else if (!membership) {
    fail("band_members — riga assente per membro B");
  } else if (
    membership.status !== "active" &&
    membership.status !== "pending_quota"
  ) {
    fail(`band_members — status inatteso: ${membership.status}`);
  } else {
    ok(`   band_members status=${membership.status} role=${membership.role}`);
  }

  // 7. Se pending_quota, simula pagamento quota e attivazione
  if (membership?.status === "pending_quota") {
    ok("7. Simulazione pagamento quota e attivazione membro B…");
    await ensureMemberQuota(service, memberB.id, fiscalYear);
    const { error: activateErr } = await service
      .from("band_members")
      .update({ status: "active" })
      .eq("band_id", cleanup.bandId)
      .eq("member_id", memberB.id);

    if (activateErr) {
      fail(`band_members activate: ${activateErr.message}`);
    } else {
      ok("   quota upsert + band_members → active");
    }
  } else {
    ok("7. Membro B già active — skip simulazione quota");
  }

  // 8. band_all_members_quota_ok
  ok("8. Verifica band_all_members_quota_ok…");
  const { data: quotaOk, error: quotaOkErr } = await service.rpc("band_all_members_quota_ok", {
    p_band_id: cleanup.bandId,
    p_fiscal_year: fiscalYear,
  });

  if (quotaOkErr) {
    fail(`band_all_members_quota_ok: ${quotaOkErr.message}`);
  } else if (quotaOk !== true) {
    fail(`band_all_members_quota_ok — atteso true, ottenuto ${quotaOk}`);
  } else {
    ok("   band_all_members_quota_ok → true");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  console.log("\nCleanup…");
  if (cleanup.inviteId) {
    await service.from("band_invites").delete().eq("id", cleanup.inviteId);
  }
  if (cleanup.bandId) {
    await service.from("band_members").delete().eq("band_id", cleanup.bandId);
    await service.from("bands").delete().eq("id", cleanup.bandId);
  }
  for (const memberId of cleanup.memberIds) {
    await service.from("member_annual_quotas").delete().eq("member_id", memberId);
    await service.from("member_roles").delete().eq("member_id", memberId);
    await service.from("members").delete().eq("id", memberId);
  }
  for (const userId of cleanup.authUserIds) {
    if (userId) {
      try {
        await deleteAuthUser(supabaseUrl, serviceKey, userId);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
  ok("cleanup completato");
}

console.log(exitCode ? "\nTest FAILED" : "\nTest PASSED");
process.exit(exitCode);
