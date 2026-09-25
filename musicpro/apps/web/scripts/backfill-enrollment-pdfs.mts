#!/usr/bin/env npx tsx
/**
 * Backfill PDF iscrizione (layout legacy) per le ultime N registrazioni pagate.
 *
 * Uso:
 *   npx tsx scripts/backfill-enrollment-pdfs.mts
 *   npx tsx scripts/backfill-enrollment-pdfs.mts --limit=30
 *   npx tsx scripts/backfill-enrollment-pdfs.mts --dry-run
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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 20;

async function main() {
  const { backfillRecentEnrollmentPdfs } = await import(
    "../src/lib/iscrizione/enrollment-service.ts"
  );

  console.log(
    `Backfill PDF iscrizione: limit=${limit} dryRun=${dryRun}`,
  );
  const out = await backfillRecentEnrollmentPdfs({ limit, dryRun });
  console.log(`Totale: ${out.total} · ok: ${out.ok} · fail: ${out.failed.length}`);
  for (const row of out.results) {
    console.log(`  ✓ ${row.name} (${row.id}) ${row.pdfUrl || ""}`);
  }
  for (const row of out.failed) {
    console.log(`  ✗ ${row.name} (${row.id}): ${row.error}`);
  }
  if (out.failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
