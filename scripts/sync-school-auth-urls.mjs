#!/usr/bin/env node
/**
 * Allinea Site URL + Redirect URLs del progetto MusicProSchool.
 * Senza questo, reset password / magic link cadono su localhost.
 *
 *   node scripts/sync-school-auth-urls.mjs           # apply
 *   node scripts/sync-school-auth-urls.mjs --check   # solo verifica
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "mlsiagbrejjylqvcnfbe";
const SITE_URL = "https://school.musicproeventi.it";
const ALLOW_LIST = [
  "https://school.musicproeventi.it",
  "https://school.musicproeventi.it/**",
  "https://school.musicproeventi.it/auth/callback",
  "http://localhost:3000/**",
  "http://127.0.0.1:3000/**",
  "musicpro://**",
];
const CHECK_ONLY = process.argv.includes("--check");

function loadEnv(file) {
  const map = new Map();
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      map.set(t.slice(0, i), t.slice(i + 1).replace(/^["']|["']$/g, ""));
    }
  } catch {
    // optional
  }
  return map;
}

function decodeKeyringToken(raw) {
  const prefix = "go-keyring-base64:";
  if (!raw.startsWith(prefix)) return raw;
  return Buffer.from(raw.slice(prefix.length), "base64").toString("utf8");
}

function loadAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN;
  }
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
      { encoding: "utf8" },
    ).trim();
    return decodeKeyringToken(raw);
  } catch {
    return "";
  }
}

async function authConfig(method, token, body) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SupabaseCLI/2.115.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

async function assertRecoveryRedirect() {
  const env = loadEnv(path.join(ROOT, "musicpro/.env"));
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    env.get("NEXT_PUBLIC_SUPABASE_URL") ||
    ""
  ).replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
  if (!url || !key) {
    fail("Manca NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  const redirectTo = `${SITE_URL}/auth/callback?redirect=/reset-password`;
  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "recovery",
      email: "appstore.review@musicproeventi.it",
      redirect_to: redirectTo,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    fail(`generate_link ${res.status}: ${data.error_code || data.msg || data.message}`);
    return;
  }
  const action = data.properties?.action_link || data.action_link || "";
  const nested = new URL(action).searchParams.get("redirect_to") || "";
  if (/localhost|127\.0\.0\.1/i.test(nested)) {
    fail(`recovery redirect ancora su localhost: ${nested}`);
    return;
  }
  if (!nested.startsWith(SITE_URL)) {
    fail(`recovery redirect inatteso: ${nested}`);
    return;
  }
  ok(`recovery redirect ${nested}`);
}

async function main() {
  const token = loadAccessToken();
  if (!token) {
    fail("Manca SUPABASE_ACCESS_TOKEN (o login CLI Supabase)");
    return;
  }

  const current = await authConfig("GET", token);
  ok(`site_url attuale: ${current.site_url}`);
  ok(`uri_allow_list attuale: ${current.uri_allow_list || "(vuota)"}`);

  const allowJoined = ALLOW_LIST.join(",");
  const needsUpdate =
    current.site_url !== SITE_URL ||
    !ALLOW_LIST.every((item) =>
      String(current.uri_allow_list || "")
        .split(",")
        .map((s) => s.trim())
        .includes(item),
    );

  if (needsUpdate && CHECK_ONLY) {
    fail("Auth URL non allineati. Lancia senza --check per correggere.");
  } else if (needsUpdate) {
    const updated = await authConfig("PATCH", token, {
      site_url: SITE_URL,
      uri_allow_list: allowJoined,
    });
    ok(`site_url aggiornato: ${updated.site_url}`);
    ok(`uri_allow_list aggiornato: ${updated.uri_allow_list}`);
  } else {
    ok("Auth URL già allineati");
  }

  await assertRecoveryRedirect();
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
