/**
 * Smoke: genera PDF locale Letter (612×792) con dati Bommarito / socio 960.
 * Usage: from apps/web → `../../node_modules/.bin/jiti scripts/smoke-enrollment-letter-pdf.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { generateLegacyLayoutPdf } from "../src/lib/iscrizione/enrollment-pdf";

const require = createRequire(import.meta.url);

function getKv(file: string, key: string): string {
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return "";
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

function pick(key: string): string {
  const root = path.resolve(__dirname, "../../../..");
  for (const f of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, "musicpro/apps/web/.env.local"),
  ]) {
    const v = getKv(f, key);
    if (v) return v;
  }
  return "";
}

async function loadBommaritoSignature(): Promise<string | null> {
  const url = pick("NEXT_PUBLIC_SUPABASE_URL") || pick("SUPABASE_URL");
  const key = pick("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  try {
    const { createClient } = require("@supabase/supabase-js");
    const sb = createClient(url, key);
    const { data } = await sb
      .from("enrollments")
      .select("form_payload")
      .eq("member_id", "d498b9fa-cdc2-49a7-8f02-63876a650455")
      .limit(1);
    const sig = data?.[0]?.form_payload?.signatureData;
    return typeof sig === "string" && sig.length > 20 ? sig : null;
  } catch {
    return null;
  }
}

async function main() {
  const signatureData = await loadBommaritoSignature();
  const pdf = await generateLegacyLayoutPdf({
    memberNumber: 960,
    nome: "Daniele",
    cognome: "Bommarito",
    luogoNascita: "Lavagna",
    provNascita: "GE",
    dataNascita: "2018-06-01",
    indirizzo: "Via delle Galle 39",
    cap: "16043",
    citta: "Cogorno",
    prov: "GE",
    cf: "BMMDNL18H01E488Z",
    email: "fedesba@libero.it",
    telefono: "3470090671",
    corso: "Batteria",
    tutoreNome: "Federica",
    tutoreCognome: "Sbarboro",
    tutoreTelefono: "3478489475",
    tutoreEmail: "fedesba@libero.it",
    tutoreCf: "SBRFRC78R71I693L",
    quotaLabel: "€ 15,00",
    dataOggi: "21/10/2026",
    signatureData,
  });

  const out = path.resolve(
    __dirname,
    "../../../../.cursor/artifacts/bommarito-letter-smoke.pdf",
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pdf.bytes);

  const { PDFDocument } = require("pdf-lib");
  const loaded = await PDFDocument.load(pdf.bytes);
  const { width, height } = loaded.getPages()[0].getSize();
  console.log(
    JSON.stringify(
      {
        out,
        filename: pdf.filename,
        bytes: pdf.bytes.length,
        pageSize: `${width}x${height}`,
        ok: width === 612 && height === 792,
      },
      null,
      2,
    ),
  );
  if (width !== 612 || height !== 792) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
