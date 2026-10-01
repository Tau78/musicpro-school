#!/usr/bin/env node
/**
 * After Guideline 3.2 reject: cancel stale reviewSubmissions, attach latest
 * VALID build, leave version ready for asc-metadata + asc-submit --yes.
 * Does not set Unlisted (Apple form after approval). Does not print demo password.
 */
import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const APP_ID = process.env.ASC_APP_ID || "6806407450";
const API = "https://api.appstoreconnect.apple.com";

function loadEnv() {
  if (process.env.ASC_KEY_ID && process.env.ASC_ISSUER_ID && process.env.ASC_KEY_PATH) {
    return {
      kid: process.env.ASC_KEY_ID,
      iss: process.env.ASC_ISSUER_ID,
      keyPath: process.env.ASC_KEY_PATH,
    };
  }
  const envPath = resolve(homedir(), ".app-store/asc-api/key.env");
  const text = readFileSync(envPath, "utf8");
  const map = Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
  return {
    kid: map.ASC_KEY_ID || map.APPLE_API_KEY_ID,
    iss: map.ASC_ISSUER_ID || map.APPLE_API_ISSUER_ID,
    keyPath: map.ASC_KEY_PATH || map.APPLE_API_KEY_PATH,
  };
}

function jwt({ kid, iss, keyPath }) {
  const key = createPrivateKey(readFileSync(keyPath));
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss, iat: now, exp: now + 20 * 60, aud: "appstoreconnect-v1" }),
  );
  const data = `${header}.${payload}`;
  const sign = createSign("SHA256");
  sign.update(data);
  sign.end();
  const sig = sign.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${data}.${sig}`;
}

async function api(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const creds = loadEnv();
  const token = jwt(creds);
  console.log("ASC prepare Unlisted resubmit — app", APP_ID);

  const subs = await api(
    token,
    "GET",
    `/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=10`,
  );
  if (!subs.ok) throw new Error(`list submissions ${subs.status}`);
  const cancelStates = new Set(["UNRESOLVED_ISSUES", "READY_FOR_REVIEW"]);
  for (const s of subs.json.data || []) {
    const st = s.attributes?.state;
    if (!cancelStates.has(st)) continue;
    console.log("cancel", s.id, st);
    const c = await api(token, "PATCH", `/v1/reviewSubmissions/${s.id}`, {
      data: {
        type: "reviewSubmissions",
        id: s.id,
        attributes: { canceled: true },
      },
    });
    if (!c.ok) console.log("  skip", c.status, JSON.stringify(c.json?.errors || c.json).slice(0, 200));
    else {
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const cur = await api(token, "GET", `/v1/reviewSubmissions/${s.id}`);
        const cst = cur.json?.data?.attributes?.state;
        if (!cancelStates.has(cst) && cst !== "CANCELING") {
          console.log("  →", cst);
          break;
        }
      }
    }
  }

  const vers = await api(
    token,
    "GET",
    `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`,
  );
  const version =
    (vers.json.data || []).find((v) =>
      ["REJECTED", "PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "METADATA_REJECTED"].includes(
        v.attributes?.appStoreState,
      ),
    ) || (vers.json.data || [])[0];
  if (!version) throw new Error("no iOS version");
  const versionId = version.id;
  console.log(
    "version",
    version.attributes.versionString,
    version.attributes.appStoreState,
    versionId,
  );

  const builds = await api(
    token,
    "GET",
    `/v1/builds?filter[app]=${APP_ID}&filter[processingState]=VALID&sort=-uploadedDate&limit=15`,
  );
  const build = (builds.json.data || []).find((b) => !b.attributes?.expired);
  if (!build) throw new Error("no VALID build");
  console.log("attach build", build.attributes.version, build.id);

  const attach = await api(token, "PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: "builds", id: build.id },
  });
  if (!attach.ok && attach.status !== 204) {
    console.log("attach status", attach.status, JSON.stringify(attach.json?.errors || attach.json).slice(0, 400));
  } else {
    console.log("OK build attached");
  }

  const again = await api(token, "GET", `/v1/appStoreVersions/${versionId}`);
  console.log(
    "version now",
    again.json?.data?.attributes?.versionString,
    again.json?.data?.attributes?.appStoreState,
  );
  console.log("Next: bash scripts/asc-metadata.sh && ASC_SUBMIT=1 bash scripts/asc-submit.sh");
  console.log(
    "Then: Apple Unlisted request form (developer.apple.com/contact/request/unlisted-app/) — cannot be done via API.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
