/**
 * Rigenera pdf_base64 per ricevute emesse e (opzionale) invia campioni email.
 *
 *   cd musicpro/apps/web && npx tsx scripts/backfill-fiscal-receipt-pdfs.mts
 *   npx tsx scripts/backfill-fiscal-receipt-pdfs.mts --dry-run
 *   npx tsx scripts/backfill-fiscal-receipt-pdfs.mts --send=musicproeventi@gmail.com --codes=SAL/2/2026,QUO/1/2026
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { getFiscalReceipt, listFiscalReceipts } from "@musicpro/database";

import { sendEnrollmentEmail } from "../src/lib/iscrizione/email-transport";
import { generateFiscalReceiptPdf } from "../src/lib/lezioni/fiscal-receipt-pdf";
import { bytesToBase64 } from "../src/lib/lezioni/issue-receipt-copy";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(webRoot, "../../..");

function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [
          line.slice(0, i),
          line.slice(i + 1).replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const env = {
  ...readEnvFile(join(repoRoot, ".env")),
  ...readEnvFile(join(repoRoot, "musicpro/.env")),
};

for (const [key, value] of Object.entries(env)) {
  if (value && !process.env[key]) process.env[key] = value;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const sendArg = process.argv.find((a) => a.startsWith("--send="));
const sendTo = sendArg?.slice("--send=".length).trim();
const codesArg = process.argv.find((a) => a.startsWith("--codes="));
const sendCodes = codesArg
  ? codesArg
      .slice("--codes=".length)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  : [];

const service = createClient(url, key);

async function main() {
  const rows = await listFiscalReceipts(service, {
    includeReplaced: true,
  });
  const emesse = rows.filter((r) => r.status === "emessa");
  console.log(`Ricevute emesse: ${emesse.length}`);

  let updated = 0;
  for (const row of emesse) {
    const full = await getFiscalReceipt(service, row.id);
    if (!full) continue;
    const pdf = await generateFiscalReceiptPdf(full);
    const b64 = bytesToBase64(pdf.bytes);
    if (dryRun) {
      console.log(`[dry-run] ${full.code} → ${pdf.bytes.length} bytes`);
      continue;
    }
    const { error } = await service
      .from("fiscal_receipts")
      .update({ pdf_base64: b64 })
      .eq("id", full.id)
      .eq("status", "emessa");
    if (error) {
      console.error(`FAIL update ${full.code}:`, error.message);
      continue;
    }
    updated++;
    console.log(`OK pdf_base64 ${full.code}`);
  }

  if (!dryRun) {
    console.log(`Aggiornate ${updated}/${emesse.length} ricevute.`);
  }

  if (!sendTo || sendCodes.length === 0) return;

  if (!env.RESEND_API_KEY?.trim() && !env.GOOGLE_SMTP_USER?.trim()) {
    console.error("Manca SMTP/Resend per invio campioni");
    process.exit(1);
  }

  for (const code of sendCodes) {
    const match = emesse.find((r) => r.code === code);
    if (!match) {
      console.error(`Campione non trovato: ${code}`);
      continue;
    }
    const full = await getFiscalReceipt(service, match.id);
    if (!full) continue;
    const pdf = await generateFiscalReceiptPdf(full);
    const delivery = await sendEnrollmentEmail({
      to: [sendTo],
      subject: `[Controllo layout] Ricevuta ${code} — MusicPro School`,
      text: [
        "Ciao,",
        "",
        `In allegato la ricevuta ${code} rigenerata con il layout aggiornato.`,
        "",
        "MusicPro School",
      ].join("\n"),
      preferGoogleSmtp: true,
      attachments: [
        {
          filename: pdf.filename,
          content: bytesToBase64(pdf.bytes),
          content_type: "application/pdf",
        },
      ],
    });
    console.log(
      delivery.sent
        ? `Email OK → ${sendTo} (${code})`
        : `Email FAIL (${code}): ${delivery.error ?? "unknown"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
