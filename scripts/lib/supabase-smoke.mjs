/**
 * Shared helpers for Supabase smoke / integration scripts.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadEnv() {
  const env = {};
  const envPath = join(root, "musicpro/.env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

export function getSupabaseConfig(env = loadEnv()) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    env.NEXT_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { supabaseUrl, serviceKey, anonKey, root };
}

export function createSmokeClients(config = getSupabaseConfig()) {
  const { supabaseUrl, serviceKey, anonKey } = config;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase URL o service role mancanti in musicpro/.env");
  }
  const service = createClient(supabaseUrl, serviceKey);
  return { supabaseUrl, serviceKey, anonKey, service };
}

export function currentFiscalYear() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      year: "numeric",
    }).format(new Date()),
  );
}

export function rpcMissing(error) {
  const msg = error?.message ?? "";
  return (
    msg.includes("does not exist") ||
    msg.includes("Could not find the function") ||
    error?.code === "PGRST202"
  );
}

export async function authApi(supabaseUrl, serviceKey, method, pathSuffix, body) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}${pathSuffix}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathSuffix} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function createAuthUser(supabaseUrl, serviceKey, email, password) {
  return authApi(supabaseUrl, serviceKey, "POST", "/auth/v1/admin/users", {
    email,
    password,
    email_confirm: true,
  });
}

export async function deleteAuthUser(supabaseUrl, serviceKey, userId) {
  await authApi(supabaseUrl, serviceKey, "DELETE", `/auth/v1/admin/users/${userId}`);
}

export async function signInClient(supabaseUrl, anonKey, email, password) {
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY mancante in musicpro/.env");
  }
  const client = createClient(supabaseUrl, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Login fallito (${email}): ${error.message}`);
  }
  return { client, session: data.session };
}

export async function ensureAssociatoRole(service, memberId) {
  const { data: existing } = await service
    .from("member_roles")
    .select("id, revoked_at")
    .eq("member_id", memberId)
    .eq("role", "associato")
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
    role: "associato",
  });
}

export async function ensureMemberQuota(service, memberId, fiscalYear = currentFiscalYear()) {
  const { data: existing } = await service
    .from("member_annual_quotas")
    .select("id, paid_at")
    .eq("member_id", memberId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();

  if (existing?.paid_at) return existing;

  const payload = {
    member_id: memberId,
    fiscal_year: fiscalYear,
    paid_at: new Date().toISOString(),
    amount_paid_eur: 15,
    amount_due_eur: 15,
    notes: "Smoke test — quota",
  };

  if (existing?.id) {
    await service.from("member_annual_quotas").update(payload).eq("id", existing.id);
    return existing;
  }

  const { data, error } = await service
    .from("member_annual_quotas")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(`Quota insert: ${error.message}`);
  return data;
}

export async function createTestMember(service, {
  email,
  firstName,
  lastName,
  taxCode,
  withQuota = false,
  fiscalYear = currentFiscalYear(),
}) {
  const { data: member, error } = await service
    .from("members")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      tax_code: taxCode,
      gdpr_consent: true,
      is_active: true,
    })
    .select("id, email")
    .single();

  if (error) throw new Error(`Member insert: ${error.message}`);

  await ensureAssociatoRole(service, member.id);
  if (withQuota) {
    await ensureMemberQuota(service, member.id, fiscalYear);
  }

  return member;
}
