#!/usr/bin/env node
/**
 * Sync QUOTE sheet (+ legacy ASSOCIATI cols) → member_annual_quotas.
 *
 * Safe by default: inserts only rows missing in DB (member_id + fiscal_year).
 * Does not overwrite existing quota payments unless --update-from-sheet.
 *
 * Usage:
 *   node scripts/sync-quote-quotas.mjs --dry-run
 *   node scripts/sync-quote-quotas.mjs
 *   node scripts/sync-quote-quotas.mjs --update-from-sheet   # full sheet upsert
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const { migrateQuotaSettings, migrateMemberQuotas } = require("./migrate-from-sheets/mappers/quotas.js");
const { upsertBatched } = require("./migrate-from-sheets/supabase-client.js");
const { QUOTE_SHEET_NAME } = require("./migrate-from-sheets/config.js");
const { readSheet } = require("./migrate-from-sheets/sheets-reader.js");
const {
  normalizeWhitespace,
  normalizeAssociateName,
  parseFiscalYear,
  parseEuroAmount,
  toTimestamptz,
} = require("./migrate-from-sheets/utils.js");
const {
  loadMemberLookup,
  resolveMemberIdFromQuoteName,
} = require("./migrate-from-sheets/supabase-client.js");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in musicpro/.env",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function quotaKey(memberId, fiscalYear) {
  return `${memberId}|${fiscalYear}`;
}

async function fetchExistingQuotaKeys(supabase) {
  const keys = new Set();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("member_annual_quotas")
      .select("member_id, fiscal_year")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Load quotas: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      keys.add(quotaKey(row.member_id, row.fiscal_year));
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return keys;
}

/** Build rows from QUOTE sheet (same mapping as migrateMemberQuotas). */
async function buildQuoteSheetRows() {
  const lookup = await loadMemberLookup();
  const sheet = await readSheet(QUOTE_SHEET_NAME);
  if (sheet.missing) {
    throw new Error(`Sheet "${QUOTE_SHEET_NAME}" not found`);
  }

  const rows = [];
  const errors = [];

  sheet.rows.forEach((row, i) => {
    const sheetRowNumber = i + 2;
    const quoteName = normalizeWhitespace(row[0]);
    const fiscalYear = parseFiscalYear(row[1]);
    const paidAt = toTimestamptz(row[2]);
    const amountPaid = parseEuroAmount(row[3]);

    if (!quoteName || !fiscalYear) {
      errors.push(`QUOTE row ${sheetRowNumber}: missing name or year`);
      return;
    }

    const resolution = resolveMemberIdFromQuoteName(lookup, row[0]);
    if (!resolution.id) {
      errors.push(`QUOTE row ${sheetRowNumber}: member not found "${row[0]}"`);
      return;
    }

    rows.push({
      sheetRowNumber,
      quoteName,
      fiscalYear,
      matchType: resolution.matchType,
      matchedName: resolution.matchedName ?? null,
      payload: {
        member_id: resolution.id,
        fiscal_year: fiscalYear,
        paid_at: paidAt,
        amount_paid_eur: amountPaid,
        amount_due_eur: amountPaid,
        notes: "Synced from QUOTE sheet",
      },
    });
  });

  return { rows, errors };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("-n");
  const updateFromSheet = process.argv.includes("--update-from-sheet");

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON required for sheet read");
  }

  console.log("=== Sync QUOTE → member_annual_quotas ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(
    `Strategy: ${updateFromSheet ? "upsert all sheet rows" : "insert missing only (safe)"}`,
  );
  console.log("");

  const settingsStats = await migrateQuotaSettings(dryRun);
  if (settingsStats.errors.length) {
    console.warn("annual_quota_settings warnings:", settingsStats.errors.join("; "));
  } else {
    console.log(`annual_quota_settings: ${settingsStats.inserted} row(s) upserted`);
  }

  const { rows: sheetRows, errors } = await buildQuoteSheetRows();
  if (errors.length) {
    console.log(`\nSkipped / unresolved (${errors.length}):`);
    for (const err of errors) console.log(`  - ${err}`);
  }

  const supabase = getSupabase();
  const existingKeys = updateFromSheet
    ? new Set()
    : await fetchExistingQuotaKeys(supabase);

  const toWrite = sheetRows.filter((row) => {
    const key = quotaKey(row.payload.member_id, row.payload.fiscal_year);
    return updateFromSheet || !existingKeys.has(key);
  });

  const skippedExisting = sheetRows.length - toWrite.length;

  console.log(`\nQUOTE risolvibili: ${sheetRows.length}`);
  console.log(`Già in DB (skip): ${skippedExisting}`);
  console.log(`Da scrivere: ${toWrite.length}`);

  if (toWrite.length) {
    console.log("\nRighe da importare:");
    for (const row of toWrite) {
      const paid = row.payload.paid_at
        ? String(row.payload.paid_at).slice(0, 10)
        : "—";
      console.log(
        `  riga ${row.sheetRowNumber}: ${row.quoteName} (${row.fiscalYear}) → ${row.matchedName ?? row.matchType} · pagato ${paid}`,
      );
    }
  }

  if (!toWrite.length) {
    console.log("\nNessuna riga da scrivere.");
    return;
  }

  const payloads = toWrite.map((row) => row.payload);
  const result = await upsertBatched(
    "member_annual_quotas",
    payloads,
    "member_id,fiscal_year",
    dryRun,
  );

  console.log(
    `\n${dryRun ? "Would write" : "Written"}: ${result.count} row(s) in member_annual_quotas`,
  );

  if (!dryRun) {
    console.log("\nVerifica:");
    console.log("  node scripts/verify-quota-import.mjs");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
