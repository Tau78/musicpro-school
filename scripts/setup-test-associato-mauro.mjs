#!/usr/bin/env node
/**
 * Account test associato: mauro.andreoni@gmail.com
 * - ruolo associato + quota anno corrente pagata
 * - crediti sala ~illimitati (ledger adjustment)
 * - sala "Sandbox" (slug sandbox-test): le prenotazioni lì non bloccano Rossa/Verde/Arancio
 *
 * Usage:
 *   node scripts/setup-test-associato-mauro.mjs
 *   node scripts/setup-test-associato-mauro.mjs --password 'TuaPassword!'
 *
 * Scrive credenziali in musicpro/.env.local (gitignored).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  authApi,
  createAuthUser,
  createSmokeClients,
  currentFiscalYear,
  ensureAssociatoRole,
  ensureMemberQuota,
} from "./lib/supabase-smoke.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = join(root, "musicpro/.env.local");

const TEST_EMAIL = "mauro.andreoni@gmail.com";
const TEST_FIRST = "Mauro";
const TEST_LAST = "Andreoni";
const TEST_TAX = "TSTMRN78T13I693X"; // CF fittizio unico per account test
const CREDITS_TARGET = 999_999;
const SANDBOX_SLUG = "sandbox-test";
const SANDBOX_NAME = "Sandbox (test)";

function argPassword() {
  const i = process.argv.indexOf("--password");
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

async function findAuthUserByEmail(supabaseUrl, serviceKey, email) {
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

async function upsertAuthUser(supabaseUrl, serviceKey, email, password) {
  const existing = await findAuthUserByEmail(supabaseUrl, serviceKey, email);
  if (existing?.id) {
    await authApi(
      supabaseUrl,
      serviceKey,
      "PUT",
      `/auth/v1/admin/users/${existing.id}`,
      { email, password, email_confirm: true },
    );
    return existing.id;
  }
  const created = await createAuthUser(supabaseUrl, serviceKey, email, password);
  return created.id ?? created.user?.id;
}

function upsertEnvLocal(email, password) {
  const lines = existsSync(envLocalPath)
    ? readFileSync(envLocalPath, "utf8").split("\n")
    : [];
  const keys = new Map([
    ["TEST_ASSOCIATO_MAURO_EMAIL", email],
    ["TEST_ASSOCIATO_MAURO_PASSWORD", password],
  ]);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return true;
    const key = trimmed.split("=")[0];
    return !keys.has(key);
  });
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  kept.push("");
  kept.push("# Test associato Mauro — scripts/setup-test-associato-mauro.mjs");
  for (const [k, v] of keys) kept.push(`${k}=${v}`);
  kept.push("");
  writeFileSync(envLocalPath, kept.join("\n"), "utf8");
}

async function ensureSandboxRoom(service) {
  const { data: existing } = await service
    .from("rooms")
    .select("id, name, slug, is_active")
    .eq("slug", SANDBOX_SLUG)
    .maybeSingle();

  const payload = {
    name: SANDBOX_NAME,
    slug: SANDBOX_SLUG,
    description:
      "Sala fittizia per test. Le prenotazioni qui non occupano Rossa/Verde/Arancio.",
    capacity: 1,
    is_active: true,
    sort_order: 99,
    hourly_rate_eur: 0,
    slot_granularity_minutes: 30,
    default_duration_minutes: 60,
    min_duration_minutes: 30,
    max_duration_minutes: 480,
    open_hour: 0,
    close_hour: 24,
    open_minute: 0,
    close_minute: 1440,
    google_calendar_color_id: null,
    provi_da_solo_enabled: false,
    provi_da_solo_discount_eur: 0,
  };

  if (existing?.id) {
    await service.from("rooms").update(payload).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await service
    .from("rooms")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(`Sandbox room: ${error.message}`);
  return data.id;
}

async function ensureInfiniteCredits(service, memberId) {
  // available = SUM(amount); set target by adjusting delta
  const { data: rows } = await service
    .from("credit_transactions")
    .select("amount")
    .eq("member_id", memberId);
  const current = (rows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const delta = CREDITS_TARGET - current;
  if (delta === 0) {
    return { current, delta: 0 };
  }
  const { error } = await service.from("credit_transactions").insert({
    member_id: memberId,
    amount: delta,
    type: "adjustment",
    reason: "Account test — crediti sala illimitati (setup-test-associato-mauro)",
    created_by: null,
  });
  if (error) throw new Error(`credit_transactions: ${error.message}`);
  return { current: CREDITS_TARGET, delta };
}

const { supabaseUrl, serviceKey, service } = createSmokeClients();
const fiscalYear = currentFiscalYear();
const password =
  argPassword() ||
  process.env.TEST_ASSOCIATO_MAURO_PASSWORD?.trim() ||
  `MpTest${randomBytes(5).toString("hex")}!`;

console.log("=== Setup test associato mauro.andreoni@gmail.com ===\n");

const { data: byEmail } = await service
  .from("members")
  .select("id, email, first_name, last_name, user_id, tax_code")
  .ilike("email", TEST_EMAIL)
  .maybeSingle();

let memberId = byEmail?.id;

if (!memberId) {
  const { data: created, error } = await service
    .from("members")
    .insert({
      first_name: TEST_FIRST,
      last_name: TEST_LAST,
      email: TEST_EMAIL,
      tax_code: TEST_TAX,
      gdpr_consent: true,
      gdpr_consent_at: new Date().toISOString(),
      is_active: true,
      is_enrollment_draft: false,
      is_test_account: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`members insert: ${error.message}`);
  memberId = created.id;
  console.log(`OK  member creato ${memberId}`);
} else {
  const { error } = await service
    .from("members")
    .update({
      first_name: TEST_FIRST,
      last_name: TEST_LAST,
      email: TEST_EMAIL,
      tax_code: TEST_TAX,
      is_active: true,
      gdpr_consent: true,
      gdpr_consent_at: new Date().toISOString(),
      is_enrollment_draft: false,
      is_test_account: true,
    })
    .eq("id", memberId);
  if (error) throw new Error(`members update: ${error.message}`);
  console.log(
    `OK  member aggiornato ${memberId} (era ${byEmail.first_name} ${byEmail.last_name})`,
  );
}

await ensureAssociatoRole(service, memberId);
console.log("OK  ruolo associato");

await ensureMemberQuota(service, memberId, fiscalYear);
// mark quota note as test
await service
  .from("member_annual_quotas")
  .update({
    notes: "Account test — quota",
    amount_paid_eur: 15,
    amount_due_eur: 15,
  })
  .eq("member_id", memberId)
  .eq("fiscal_year", fiscalYear);
console.log(`OK  quota ${fiscalYear} pagata`);

const credits = await ensureInfiniteCredits(service, memberId);
console.log(
  `OK  crediti sala → ${credits.current} (delta ${credits.delta >= 0 ? "+" : ""}${credits.delta})`,
);

const roomId = await ensureSandboxRoom(service);
console.log(`OK  sala ${SANDBOX_NAME} (${SANDBOX_SLUG}) id=${roomId}`);

const userId = await upsertAuthUser(supabaseUrl, serviceKey, TEST_EMAIL, password);
await service.from("members").update({ user_id: userId }).eq("id", memberId);
console.log(`OK  auth ${userId}`);

upsertEnvLocal(TEST_EMAIL, password);
console.log(`OK  credenziali in musicpro/.env.local`);

console.log(`
--- Login ---
Email:    ${TEST_EMAIL}
Password: ${password}
URL:      https://school.musicproeventi.it

Prenotazioni di test: scegli la sala "${SANDBOX_NAME}" — non blocca le sale reali.
Crediti: ${CREDITS_TARGET} (praticamente infiniti).
`);
