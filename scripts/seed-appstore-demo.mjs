#!/usr/bin/env node
/**
 * Seed / cleanup tag APPSTORE_DEMO for App Store review account.
 * Usage:
 *   node scripts/seed-appstore-demo.mjs          # (re)seed via note — prefer Python one-shot already run
 *   node scripts/seed-appstore-demo.mjs --cleanup
 *
 * Demo login: appstore.review@musicproeventi.it (password not in git)
 * Fictitious only: Demo DocenteStore, Alfa/Beta DemoAllievo, courses DEMO *, bookings DEMO *
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, "musicpro/.env");
const TAG = "APPSTORE_DEMO";
const DEMO_MEMBER_ID = "ec133aba-8c83-4b41-aa42-13bfed7a2b6e";

function loadEnv(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    map.set(t.slice(0, i), t.slice(i + 1).replace(/^["']|["']$/g, ""));
  }
  return map;
}

const env = loadEnv(envPath);
const url = (env.get("NEXT_PUBLIC_SUPABASE_URL") || env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const key = env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !key) {
  console.error("Manca SUPABASE in musicpro/.env");
  process.exit(1);
}

async function api(method, pathSuffix, body) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${pathSuffix} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function cleanup() {
  const courses = await api("GET", `/rest/v1/courses?name=like.DEMO*&select=id,name`);
  for (const c of courses ?? []) {
    await api("DELETE", `/rest/v1/courses?id=eq.${c.id}`);
    console.log("deleted course", c.name);
  }
  const bookings = await api(
    "GET",
    `/rest/v1/bookings?or=(notes.eq.${TAG},title.like.DEMO*)&select=id,title`,
  );
  for (const b of bookings ?? []) {
    await api("DELETE", `/rest/v1/bookings?id=eq.${b.id}`);
    console.log("deleted booking", b.title);
  }
  for (const email of [
    "demo.allievo.alfa@musicproeventi.it",
    "demo.allievo.beta@musicproeventi.it",
  ]) {
    const rows = await api("GET", `/rest/v1/members?email=eq.${encodeURIComponent(email)}&select=id,email`);
    for (const m of rows ?? []) {
      await api("DELETE", `/rest/v1/member_roles?member_id=eq.${m.id}`);
      await api("DELETE", `/rest/v1/member_annual_quotas?member_id=eq.${m.id}`);
      await api("DELETE", `/rest/v1/members?id=eq.${m.id}`);
      console.log("deleted member", m.email);
    }
  }
  console.log("Cleanup done. Demo teacher member kept:", DEMO_MEMBER_ID);
}

const cleanupMode = process.argv.includes("--cleanup");
if (cleanupMode) {
  cleanup().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.log(
    "Seed già applicato in sessione agent (Python). Per ripulire: node scripts/seed-appstore-demo.mjs --cleanup",
  );
}
