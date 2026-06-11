#!/usr/bin/env node
/**
 * Compare QUOTE sheet rows vs member_annual_quotas in Supabase.
 * Usage: node scripts/verify-quota-import.mjs [--json]
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

const { QUOTE_SHEET_NAME } = require("./migrate-from-sheets/config.js");
const { readSheet } = require("./migrate-from-sheets/sheets-reader.js");
const {
  normalizeWhitespace,
  normalizeAssociateName,
  parseFiscalYear,
} = require("./migrate-from-sheets/utils.js");
const {
  loadMemberLookup,
  resolveMemberIdFromQuoteName,
} = require("./migrate-from-sheets/supabase-client.js");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in musicpro/.env");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAllQuotas(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabase
      .from("member_annual_quotas")
      .select(
        "member_id, fiscal_year, paid_at, amount_paid_eur, members!member_annual_quotas_member_id_fkey(first_name, last_name)"
      )
      .order("fiscal_year", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Query member_annual_quotas: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function memberFullName(member) {
  if (!member) return "";
  return normalizeAssociateName(`${member.first_name ?? ""} ${member.last_name ?? ""}`);
}

function quotaKey(memberId, fiscalYear) {
  return `${memberId}|${fiscalYear}`;
}

async function main() {
  const jsonOnly = process.argv.includes("--json");
  const supabase = getSupabase();

  const sheet = await readSheet(QUOTE_SHEET_NAME);
  if (sheet.missing) {
    throw new Error(`Sheet "${QUOTE_SHEET_NAME}" not found`);
  }

  const lookup = await loadMemberLookup();
  const dbRows = await fetchAllQuotas(supabase);
  const dbByKey = new Map(
    dbRows.map((r) => [quotaKey(r.member_id, r.fiscal_year), r])
  );

  const sheetResolvable = [];
  const sheetSkippedInvalid = [];
  const sheetMemberNotFound = [];

  sheet.rows.forEach((row, i) => {
    const sheetRowNumber = i + 2;
    const quoteName = normalizeWhitespace(row[0]);
    const fiscalYear = parseFiscalYear(row[1]);

    if (!quoteName || !fiscalYear) {
      sheetSkippedInvalid.push({ sheetRowNumber, quoteName: quoteName || null, fiscalYear });
      return;
    }

    const resolution = resolveMemberIdFromQuoteName(lookup, row[0]);
    const entry = {
      sheetRowNumber,
      quoteName,
      fiscalYear,
      memberId: resolution.id,
      matchType: resolution.matchType,
      matchedName: resolution.matchedName ?? null,
    };

    if (!resolution.id) {
      sheetMemberNotFound.push(entry);
    } else {
      sheetResolvable.push(entry);
    }
  });

  const missingInDb = sheetResolvable.filter(
    (s) => !dbByKey.has(quotaKey(s.memberId, s.fiscalYear))
  );

  const sheetKeys = new Set(
    sheetResolvable.map((s) => quotaKey(s.memberId, s.fiscalYear))
  );
  const extraInDb = dbRows.filter(
    (r) => !sheetKeys.has(quotaKey(r.member_id, r.fiscal_year))
  );

  const fiscalYears = dbRows.map((r) => r.fiscal_year).filter(Boolean);
  const report = {
    generatedAt: new Date().toISOString(),
    sheet: {
      totalDataRows: sheet.rows.length,
      resolvableRows: sheetResolvable.length,
      skippedInvalid: sheetSkippedInvalid.length,
      memberNotFound: sheetMemberNotFound.length,
      memberNotFoundDetails: sheetMemberNotFound.map((s) => ({
        sheetRowNumber: s.sheetRowNumber,
        quoteName: s.quoteName,
        fiscalYear: s.fiscalYear,
      })),
    },
    database: {
      totalRows: dbRows.length,
      fiscalYearMin: fiscalYears.length ? Math.min(...fiscalYears) : null,
      fiscalYearMax: fiscalYears.length ? Math.max(...fiscalYears) : null,
    },
    comparison: {
      expectedFromQuoteSheet: sheetResolvable.length,
      missingInDb: missingInDb.length,
      missingDetails: missingInDb.map((s) => ({
        sheetRowNumber: s.sheetRowNumber,
        quoteName: s.quoteName,
        fiscalYear: s.fiscalYear,
        matchType: s.matchType,
        matchedName: s.matchedName,
      })),
      extraInDb: extraInDb.length,
    },
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=== Verifica import QUOTE → member_annual_quotas ===\n");
  console.log(`Foglio QUOTE: ${sheet.rows.length} righe dati`);
  console.log(`  Risolvibili (nome → member): ${report.sheet.resolvableRows}`);
  console.log(`  Scartate (nome/anno mancante): ${report.sheet.skippedInvalid}`);
  console.log(`  Associato non trovato: ${report.sheet.memberNotFound}`);
  console.log("");
  console.log(`Supabase member_annual_quotas: ${report.database.totalRows} righe`);
  console.log(
    `  Anni fiscali: ${report.database.fiscalYearMin ?? "—"} – ${report.database.fiscalYearMax ?? "—"}`
  );
  console.log("");
  console.log(`Mancanti in DB (risolti ma non importati): ${missingInDb.length}`);
  console.log(`Extra in DB (non da QUOTE): ${extraInDb.length}`);

  if (sheetMemberNotFound.length) {
    console.log("\nRighe QUOTE senza match associato:");
    for (const s of sheetMemberNotFound) {
      console.log(`  riga ${s.sheetRowNumber}: ${s.quoteName} (${s.fiscalYear})`);
    }
  }

  if (missingInDb.length) {
    console.log("\nRighe QUOTE risolte ma assenti in DB:");
    for (const s of missingInDb) {
      console.log(
        `  riga ${s.sheetRowNumber}: ${s.quoteName} → ${s.matchedName ?? s.matchType} (${s.fiscalYear})`
      );
    }
  }

  console.log("\n(JSON completo: node scripts/verify-quota-import.mjs --json)");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
