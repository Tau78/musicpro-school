#!/usr/bin/env node
/**
 * Crea/collega account auth admin e assegna ruolo admin.
 * Uso: node scripts/setup-admin-users.mjs
 * Legge SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL da musicpro/.env
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, "musicpro/.env");

function loadEnv(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    map.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
  }
  return map;
}

const env = loadEnv(envPath);
const url = (env.get("NEXT_PUBLIC_SUPABASE_URL") || env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const serviceKey = env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!url || !serviceKey) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in musicpro/.env");
  process.exit(1);
}

const PASSWORD = process.env.ADMIN_SETUP_PASSWORD || "MusicPro2026";

/** @type {{ email: string, memberId?: string, patchEmail?: { memberId: string, email: string } }[]} */
const ADMINS = [
  {
    email: "andreoni.mauro@gmail.com",
    memberId: "88788737-8378-45cc-ad8b-e3f09f9f0ac1",
  },
  {
    email: "aldo.filippo.roberti@gmail.com",
    patchEmail: {
      memberId: "8ff30ee4-23fe-4336-934b-a12e7be9a363",
      email: "aldo.filippo.roberti@gmail.com",
    },
  },
];

async function api(method, pathSuffix, body) {
  const res = await fetch(`${url}${pathSuffix}`, {
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

async function findAuthUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  while (page <= 10) {
    const data = await api(
      "GET",
      `/auth/v1/admin/users?page=${page}&per_page=200`,
    );
    const users = data?.users ?? [];
    const match = users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === normalized,
    );
    if (match) return match;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function createAuthUser(email) {
  return api("POST", "/auth/v1/admin/users", {
    email,
    password: PASSWORD,
    email_confirm: true,
  });
}

async function updateAuthPassword(userId) {
  return api("PUT", `/auth/v1/admin/users/${userId}`, {
    password: PASSWORD,
    email_confirm: true,
  });
}

async function resolveMemberId(email, hintId) {
  if (hintId) {
    const rows = await api(
      "GET",
      `/rest/v1/members?id=eq.${hintId}&select=id,email,user_id`,
    );
    if (rows?.[0]) return rows[0];
  }
  const rows = await api(
    "GET",
    `/rest/v1/members?email=eq.${encodeURIComponent(email)}&select=id,email,user_id`,
  );
  return rows?.[0] ?? null;
}

async function linkMember(memberId, userId) {
  await api("PATCH", `/rest/v1/members?id=eq.${memberId}`, {
    user_id: userId,
  });
}

async function grantAdmin(memberId) {
  const existing = await api(
    "GET",
    `/rest/v1/member_roles?member_id=eq.${memberId}&role=eq.admin&select=id,revoked_at`,
  );
  if (existing?.[0]?.revoked_at == null && existing?.[0]?.id) {
    return "already admin";
  }
  if (existing?.[0]?.id) {
    await api("PATCH", `/rest/v1/member_roles?id=eq.${existing[0].id}`, {
      revoked_at: null,
      granted_at: new Date().toISOString(),
    });
    return "admin role restored";
  }
  await api("POST", "/rest/v1/member_roles", {
    member_id: memberId,
    role: "admin",
  });
  return "admin role granted";
}

async function main() {
  for (const admin of ADMINS) {
    console.log(`\n— ${admin.email}`);

    if (admin.patchEmail) {
      await api("PATCH", `/rest/v1/members?id=eq.${admin.patchEmail.memberId}`, {
        email: admin.patchEmail.email,
      });
      console.log(`  email anagrafica aggiornata → ${admin.patchEmail.email}`);
    }

    let authUser = await findAuthUserByEmail(admin.email);
    if (authUser) {
      await updateAuthPassword(authUser.id);
      console.log(`  auth: esistente, password aggiornata (${authUser.id})`);
    } else {
      authUser = await createAuthUser(admin.email);
      console.log(`  auth: creato (${authUser.id})`);
    }

    const member = await resolveMemberId(admin.email, admin.memberId);
    if (!member) {
      console.error(`  ERRORE: nessun member per ${admin.email}`);
      continue;
    }

    if (member.user_id !== authUser.id) {
      await linkMember(member.id, authUser.id);
      console.log(`  member collegato (${member.id})`);
    } else {
      console.log(`  member già collegato (${member.id})`);
    }

    const roleResult = await grantAdmin(member.id);
    console.log(`  ruolo: ${roleResult}`);
  }

  console.log("\nFatto. Login su https://school.musicproeventi.it/login");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
