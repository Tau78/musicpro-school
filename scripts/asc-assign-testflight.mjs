#!/usr/bin/env node
// Dopo upload IPA: collega la build al gruppo interno "Test"
// (andreoni.mauro@gmail.com) così TestFlight mostra Installa.
import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEY_DIR = join(homedir(), ".app-store/asc-api");
const KEY_ENV = join(KEY_DIR, "key.env");
const APP_ID = process.env.ASC_APP_ID || "6806407450";
const API = "https://api.appstoreconnect.apple.com";
const WANT = process.argv[2] || "";
const TESTER_EMAIL = "andreoni.mauro@gmail.com";

function loadEnv() {
  const out = {};
  if (!existsSync(KEY_ENV)) return out;
  for (const line of readFileSync(KEY_ENV, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = loadEnv();
const KEY_ID = process.env.ASC_KEY_ID || env.ASC_KEY_ID || "5WS8U99P9G";
const ISSUER =
  process.env.ASC_ISSUER_ID || env.ASC_ISSUER_ID || "";
const KEY_PATH =
  process.env.ASC_KEY_PATH ||
  env.ASC_KEY_PATH ||
  join(KEY_DIR, `AuthKey_${KEY_ID}.p8`);

if (!ISSUER || !existsSync(KEY_PATH)) {
  console.error("Manca ASC_ISSUER_ID o AuthKey .p8 in ~/.app-store/asc-api/");
  process.exit(1);
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const payload = {
    iss: ISSUER,
    iat: now,
    exp: now + 18 * 60,
    aud: "appstoreconnect-v1",
  };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const key = createPrivateKey(readFileSync(KEY_PATH));
  const sign = createSign("SHA256");
  sign.update(data);
  sign.end();
  const sig = sign.sign({ key, dsaEncoding: "ieee-p1363" });
  return `${data}.${sig.toString("base64url")}`;
}

async function req(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} ${res.status} ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function ensureTesterInInternalGroups(groupIds) {
  for (const groupId of groupIds) {
    const testers = await req(
      "GET",
      `/v1/betaGroups/${groupId}/betaTesters?limit=200`,
    );
    const rows = testers.data ?? [];
    const found = rows.some(
      (t) =>
        String(t.attributes?.email || "").toLowerCase() === TESTER_EMAIL,
    );
    if (found) {
      console.log(`Tester ${TESTER_EMAIL} già nel gruppo ${groupId}`);
      continue;
    }
    // Cerca tester esistente sull'app e aggiungilo
    const all = await req(
      "GET",
      `/v1/apps/${APP_ID}/betaTesters?filter[email]=${encodeURIComponent(TESTER_EMAIL)}&limit=5`,
    );
    let tester = (all.data ?? [])[0];
    if (!tester) {
      const created = await req("POST", `/v1/betaTesters`, {
        data: {
          type: "betaTesters",
          attributes: {
            email: TESTER_EMAIL,
            firstName: "Mauro",
            lastName: "Andreoni",
          },
          relationships: {
            betaGroups: {
              data: [{ type: "betaGroups", id: groupId }],
            },
          },
        },
      });
      tester = created.data;
      console.log(`Creato tester ${TESTER_EMAIL} → gruppo ${groupId}`);
      continue;
    }
    await req("POST", `/v1/betaGroups/${groupId}/relationships/betaTesters`, {
      data: [{ type: "betaTesters", id: tester.id }],
    });
    console.log(`Aggiunto ${TESTER_EMAIL} al gruppo ${groupId}`);
  }
}

async function listInternalGroups() {
  const json = await req(
    "GET",
    `/v1/apps/${APP_ID}/betaGroups?limit=50`,
  );
  const rows = json.data ?? [];
  const internal = rows.filter((g) => g.attributes?.isInternalGroup === true);
  if (internal.length) return internal;
  // Fallback: gruppo chiamato "Test"
  const named = rows.filter(
    (g) => String(g.attributes?.name || "").toLowerCase() === "test",
  );
  return named.length ? named : rows;
}

async function findBuild() {
  const json = await req(
    "GET",
    `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=20`,
  );
  const rows = json.data ?? [];
  if (WANT) {
    const match = rows.find((b) => b.attributes?.version === String(WANT));
    if (match) return match;
  }
  return rows[0] ?? null;
}

async function waitForBuild() {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const build = await findBuild();
    if (build && (!WANT || build.attributes?.version === String(WANT))) {
      const state = build.attributes?.processingState;
      console.log(
        `Build ${build.attributes?.version} state=${state || "?"} id=${build.id}`,
      );
      if (state === "VALID") return build;
      if (state === "FAILED" || state === "INVALID") {
        throw new Error(`Build non valida: ${state}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20000));
  }
  return null;
}

const groups = await listInternalGroups();
if (!groups.length) {
  console.error("Nessun gruppo TestFlight interno sull'app School.");
  process.exit(1);
}
const groupIds = groups.map((g) => g.id);
console.log(
  "Gruppi interni:",
  groups.map((g) => `${g.attributes?.name} (${g.id})`).join(", "),
);

await ensureTesterInInternalGroups(groupIds);

const allAccess = groups.filter((g) => g.attributes?.hasAccessToAllBuilds === true);
if (allAccess.length) {
  console.log(
    "Gruppi con accesso a tutte le build (nessun assign esplicito):",
    allAccess.map((g) => g.attributes?.name).join(", "),
  );
}

const build = await waitForBuild();
if (!build) {
  console.error(`Nessuna build ${WANT || "recente"} su App Store Connect.`);
  process.exit(1);
}

const version = build.attributes?.version;
const needAssign = groups.filter((g) => g.attributes?.hasAccessToAllBuilds !== true);
if (!needAssign.length) {
  console.log(
    `Build ${version} già disponibile ai tester interni (IN_BETA_TESTING). Tester ${TESTER_EMAIL} ok.`,
  );
  console.log("Tira giù per aggiornare in TestFlight (Installa, non Aggiorna).");
  process.exit(0);
}

for (const group of needAssign) {
  try {
    await req("POST", `/v1/betaGroups/${group.id}/relationships/builds`, {
      data: [{ type: "builds", id: build.id }],
    });
    console.log(
      `TestFlight gruppo ${group.attributes?.name} → build ${version} (${build.id}).`,
    );
  } catch (err) {
    console.warn(String(err.message || err).slice(0, 400));
  }
}
console.log("Tira giù per aggiornare in TestFlight (Installa, non Aggiorna).");
