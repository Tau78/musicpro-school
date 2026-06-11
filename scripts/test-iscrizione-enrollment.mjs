#!/usr/bin/env node
/**
 * Smoke test: POST enrollment → verify row in Supabase enrollments.
 *
 * Prerequisiti:
 *   1. Next.js dev server: cd musicpro && npm run dev --workspace=@musicpro/web
 *   2. Env in musicpro/.env (SUPABASE_SERVICE_ROLE_KEY, STRIPE_*, NEXT_PUBLIC_SUPABASE_URL)
 *
 * Uso:
 *   node scripts/test-iscrizione-enrollment.mjs
 *   ISCRIZIONE_TEST_API_URL=https://your-app.vercel.app/api/iscrizione node scripts/test-iscrizione-enrollment.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, "musicpro", ".env"));
loadEnvFile(path.join(root, ".env"));

const API_URL =
  process.env.ISCRIZIONE_TEST_API_URL || "http://localhost:3000/api/iscrizione";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stamp = Date.now().toString().slice(-8);
const samplePayload = {
  action: "inviaIscrizioneConPagamento",
  nome: "Test",
  cognome: "Iscrizione",
  luogo_nascita: "Milano",
  prov_nascita: "MI",
  data_nascita: "1990-01-15",
  cf: `TSTSCR${stamp}A`,
  indirizzo: "Via Test 1",
  cap: "20100",
  citta: "Milano",
  prov: "MI",
  email: `test.iscrizione.${stamp}@example.com`,
  telefono: "3331234567",
  corso: "Chitarra",
  privacy_accepted: true,
  signatureData:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
};

async function main() {
  console.log("API:", API_URL);
  console.log("POST inviaIscrizioneConPagamento…");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samplePayload),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error("Risposta non JSON:", text.slice(0, 500));
    process.exit(1);
  }

  console.log("Risposta API:", JSON.stringify(body, null, 2));

  if (!body.success || !body.idIscrizione) {
    console.error("Test fallito: enrollment non creato.");
    process.exit(1);
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("SUPABASE_URL/SERVICE_ROLE_KEY mancanti — skip verifica DB.");
    process.exit(0);
  }

  const verifyUrl = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/enrollments?id=eq.${body.idIscrizione}&select=id,legacy_enrollment_id,first_name,last_name,email,tax_code,payment_status,payment_link_url,form_payload,created_at&order=created_at.desc&limit=1`;

  const dbRes = await fetch(verifyUrl, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });

  const rows = await dbRes.json();
  console.log("\nVerifica Supabase (enrollments):");
  console.log(JSON.stringify(rows, null, 2));

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("Test fallito: nessuna riga in enrollments.");
    process.exit(1);
  }

  const row = rows[0];
  if (row.email !== samplePayload.email) {
    console.error("Test fallito: email non corrisponde.");
    process.exit(1);
  }

  if (!row.form_payload?.signatureData) {
    console.error("Test fallito: form_payload incompleto.");
    process.exit(1);
  }

  console.log("\nOK — enrollment salvato in Supabase.");
  console.log("SQL manuale:");
  console.log("  SELECT * FROM enrollments ORDER BY created_at DESC LIMIT 5;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
