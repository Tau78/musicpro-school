#!/usr/bin/env node
/**
 * Crea o aggiorna admin di test per Playwright E2E.
 * Scrive credenziali in musicpro/.env.local (gitignored).
 *
 * Usage: node scripts/setup-playwright-admin.mjs
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  authApi,
  createAuthUser,
  createSmokeClients,
  createTestMember,
  currentFiscalYear,
  ensureMemberQuota,
} from "./lib/supabase-smoke.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = join(root, "musicpro/.env.local");

const TEST_EMAIL =
  process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() ||
  "playwright.admin.test@musicproeventi.it";
const TEST_PASSWORD =
  process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() ||
  `MpAdmin${randomBytes(4).toString("hex")}!`;
const TEST_TAX_CODE = "PWLADM26E25Z123B";
const fiscalYear = currentFiscalYear();

const { supabaseUrl, serviceKey, service } = createSmokeClients();

async function findAuthUserByEmail(email) {
  let page = 1;
  while (page <= 10) {
    const data = await authApi(
      supabaseUrl,
      serviceKey,
      "GET",
      `/auth/v1/admin/users?page=${page}&per_page=200`,
    );
    const users = data?.users ?? [];
    const match = users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function upsertAuthUser(email, password) {
  const existing = await findAuthUserByEmail(email);
  if (existing?.id) {
    await authApi(
      supabaseUrl,
      serviceKey,
      "PUT",
      `/auth/v1/admin/users/${existing.id}`,
      {
        email,
        password,
        email_confirm: true,
      },
    );
    return existing.id;
  }

  const created = await createAuthUser(supabaseUrl, serviceKey, email, password);
  return created.id ?? created.user?.id;
}

async function ensureAdminRole(memberId) {
  const { data: existing } = await service
    .from("member_roles")
    .select("id, revoked_at")
    .eq("member_id", memberId)
    .eq("role", "admin")
    .maybeSingle();

  if (existing?.id && existing.revoked_at == null) return;

  if (existing?.id) {
    await service
      .from("member_roles")
      .update({ revoked_at: null, granted_at: new Date().toISOString() })
      .eq("id", existing.id);
    return;
  }

  await service.from("member_roles").insert({
    member_id: memberId,
    role: "admin",
  });
}

function upsertEnvLocal(email, password) {
  const lines = existsSync(envLocalPath)
    ? readFileSync(envLocalPath, "utf8").split("\n")
    : [];

  const keys = new Map([
    ["PLAYWRIGHT_ADMIN_EMAIL", email],
    ["PLAYWRIGHT_ADMIN_PASSWORD", password],
    ["PLAYWRIGHT_BASE_URL", "https://school.musicproeventi.it"],
  ]);

  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return true;
    const key = trimmed.split("=")[0];
    return !keys.has(key);
  });

  while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
    kept.pop();
  }

  if (!kept.some((line) => line.includes("Playwright E2E"))) {
    kept.push("");
    kept.push("# Playwright E2E — generato da scripts/setup-playwright-*.mjs");
  }

  for (const [key, value] of keys) {
    const idx = kept.findIndex((line) => line.startsWith(`${key}=`));
    const entry = `${key}=${value}`;
    if (idx >= 0) kept[idx] = entry;
    else kept.push(entry);
  }
  kept.push("");

  writeFileSync(envLocalPath, kept.join("\n"), "utf8");
}

console.log("Setup admin Playwright…\n");

const { data: existingMember } = await service
  .from("members")
  .select("id, email, user_id, is_active")
  .eq("email", TEST_EMAIL)
  .maybeSingle();

let memberId = existingMember?.id;

if (!memberId) {
  const member = await createTestMember(service, {
    email: TEST_EMAIL,
    firstName: "Playwright",
    lastName: "Admin Test",
    taxCode: TEST_TAX_CODE,
    withQuota: true,
    fiscalYear,
  });
  memberId = member.id;
  console.log(`OK  membro creato ${memberId.slice(0, 8)}…`);
} else {
  await ensureMemberQuota(service, memberId, fiscalYear);
  await service
    .from("members")
    .update({
      is_active: true,
      gdpr_consent: true,
      gdpr_consent_at: new Date().toISOString(),
    })
    .eq("id", memberId);
  console.log(`OK  membro esistente ${memberId.slice(0, 8)}…`);
}

await ensureAdminRole(memberId);
console.log("OK  ruolo admin");

const userId = await upsertAuthUser(TEST_EMAIL, TEST_PASSWORD);
await authApi(supabaseUrl, serviceKey, "PATCH", `/rest/v1/members?id=eq.${memberId}`, {
  user_id: userId,
});

console.log(`OK  auth collegato ${userId.slice(0, 8)}…`);

upsertEnvLocal(TEST_EMAIL, TEST_PASSWORD);
console.log(`OK  credenziali in musicpro/.env.local`);
console.log("\nAdmin test:");
console.log(`  email:    ${TEST_EMAIL}`);
console.log(`  password: ${TEST_PASSWORD}`);
