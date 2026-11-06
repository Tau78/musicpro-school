#!/usr/bin/env npx tsx
/**
 * PDF + email associato + email segreteria per le iscrizioni contanti
 * già salvate a cui la conferma non è partita.
 *
 *   npx tsx scripts/backfill-cash-enrollment-documents.mts --dry-run
 *   npx tsx scripts/backfill-cash-enrollment-documents.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const musicproRoot = path.join(__dirname, "../../..");
const repoRoot = path.join(__dirname, "../../../..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
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

loadEnvFile(path.join(musicproRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "musicpro", ".env"));

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const { backfillMissingCashEnrollmentDocuments } = await import(
    "../src/lib/iscrizione/enrollment-service.ts"
  );
  console.log(`Backfill iscrizioni contanti dryRun=${dryRun}`);
  const out = await backfillMissingCashEnrollmentDocuments({ dryRun });
  console.log(
    `Totale: ${out.total} · inviate: ${out.sent.length} · saltate: ${out.skipped.length} · fail: ${out.failed.length}`,
  );
  for (const name of out.sent) console.log(`  ✓ ${name}`);
  for (const name of out.skipped) console.log(`  · ${name}`);
  for (const row of out.failed) console.log(`  ✗ ${row.name}: ${row.error}`);
  if (!out.success) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
