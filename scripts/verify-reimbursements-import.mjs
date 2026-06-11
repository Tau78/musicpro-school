#!/usr/bin/env node
/**
 * Verifica import NOTULE → Supabase reimbursements.
 * Uso: node scripts/verify-reimbursements-import.mjs [--json]
 */
import fs from "fs";
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

const { LOG_COL_INDEX, LOG_SHEET_NAME } = require("./migrate-from-sheets/config.js");
const { readSheet } = require("./migrate-from-sheets/sheets-reader.js");
const {
  normalizeWhitespace,
  normalizeAssociateName,
  parseEuroAmount,
  parseFiscalYear,
} = require("./migrate-from-sheets/utils.js");
const { loadMemberLookup, resolveMemberId } = require("./migrate-from-sheets/supabase-client.js");

function isValidSheetRow(row) {
  const associateName = normalizeWhitespace(row[LOG_COL_INDEX.NOME_ASSOCIATO]);
  const fiscalYear = parseFiscalYear(row[LOG_COL_INDEX.ANNO]);
  const progressive = normalizeWhitespace(row[LOG_COL_INDEX.PROGRESSIVO]);
  const gross = parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_LORDO]);
  return Boolean(associateName && fiscalYear && progressive && gross && gross > 0);
}

function sheetRowKey(row) {
  const name = normalizeAssociateName(row[LOG_COL_INDEX.NOME_ASSOCIATO]);
  const year = parseFiscalYear(row[LOG_COL_INDEX.ANNO]);
  const prog = normalizeWhitespace(row[LOG_COL_INDEX.PROGRESSIVO]);
  return `${name}|${year}|${prog}`;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti in musicpro/.env");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAllReimbursements(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabase
      .from("reimbursements")
      .select(
        "id, member_id, fiscal_year, progressive, gross_amount_eur, withholding_eur, net_amount_eur, payment_method, payment_date, receipts_amount_eur, receipts_notes, pdf_url, legacy_sheet_row, generated_at, members!reimbursements_member_id_fkey(first_name, last_name)"
      )
      .order("fiscal_year", { ascending: true })
      .order("legacy_sheet_row", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Query reimbursements: ${error.message}`);
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

function dbRowKey(row) {
  const name = memberFullName(row.members);
  return `${name}|${row.fiscal_year}|${row.progressive}`;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

async function main() {
  const jsonOnly = process.argv.includes("--json");
  const supabase = getSupabase();

  const sheet = await readSheet(LOG_SHEET_NAME);
  if (sheet.missing) {
    throw new Error(`Foglio "${LOG_SHEET_NAME}" non trovato`);
  }

  const lookup = await loadMemberLookup();
  const dbRows = await fetchAllReimbursements(supabase);

  const sheetValidRows = [];
  const sheetSkippedInvalid = [];
  const sheetMemberNotFound = [];

  sheet.rows.forEach((row, i) => {
    const sheetRowNumber = i + 2;
    if (!isValidSheetRow(row)) {
      sheetSkippedInvalid.push({
      sheetRowNumber,
      reason: "campi obbligatori mancanti o importo lordo ≤ 0",
      associateName: normalizeWhitespace(row[LOG_COL_INDEX.NOME_ASSOCIATO]) || null,
      fiscalYear: parseFiscalYear(row[LOG_COL_INDEX.ANNO]),
      progressive: normalizeWhitespace(row[LOG_COL_INDEX.PROGRESSIVO]) || null,
      gross: parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_LORDO]),
    });
      return;
    }

    const associateName = normalizeWhitespace(row[LOG_COL_INDEX.NOME_ASSOCIATO]);
    const memberId = resolveMemberId(lookup, {
      fullName: normalizeAssociateName(associateName),
    });

    const entry = {
      sheetRowNumber,
      key: sheetRowKey(row),
      associateName,
      fiscalYear: parseFiscalYear(row[LOG_COL_INDEX.ANNO]),
      progressive: normalizeWhitespace(row[LOG_COL_INDEX.PROGRESSIVO]),
      gross: parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_LORDO]),
      withholding: parseEuroAmount(row[LOG_COL_INDEX.RITENUTA]),
      net: parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_NETTO]),
      receiptsAmount: parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_RICEVUTE]) ?? 0,
      receiptsNotes: normalizeWhitespace(row[LOG_COL_INDEX.RICEVUTE]) || null,
      paymentMethod: normalizeWhitespace(row[LOG_COL_INDEX.METODO_PAGAMENTO]) || null,
      memberId,
    };

    if (!memberId) {
      sheetMemberNotFound.push(entry);
    } else {
      sheetValidRows.push(entry);
    }
  });

  const dbByKey = new Map(dbRows.map((r) => [dbRowKey(r), r]));
  const dbByLegacyRow = new Map(
    dbRows.filter((r) => r.legacy_sheet_row != null).map((r) => [r.legacy_sheet_row, r])
  );

  const missingInDb = [];
  const amountMismatches = [];

  for (const s of sheetValidRows) {
    const db = dbByLegacyRow.get(s.sheetRowNumber) ?? dbByKey.get(s.key);
    if (!db) {
      missingInDb.push(s);
      continue;
    }

    const dbGross = Number(db.gross_amount_eur);
    const dbReceipts = Number(db.receipts_amount_eur ?? 0);
    if (Math.abs(dbGross - s.gross) > 0.01 || Math.abs(dbReceipts - s.receiptsAmount) > 0.01) {
      amountMismatches.push({
        sheetRowNumber: s.sheetRowNumber,
        key: s.key,
        sheet: { gross: s.gross, receiptsAmount: s.receiptsAmount },
        db: { gross: dbGross, receiptsAmount: dbReceipts },
      });
    }
  }

  const sheetKeys = new Set(sheetValidRows.map((s) => s.key));
  const extraInDb = dbRows.filter((r) => !sheetKeys.has(dbRowKey(r)));

  const fiscalYears = dbRows.map((r) => r.fiscal_year).filter(Boolean);
  const minYear = fiscalYears.length ? Math.min(...fiscalYears) : null;
  const maxYear = fiscalYears.length ? Math.max(...fiscalYears) : null;

  const pdfNullCount = dbRows.filter((r) => r.pdf_url == null).length;
  const receiptsNonZero = dbRows.filter((r) => Number(r.receipts_amount_eur) > 0).length;
  const receiptsNotesNonEmpty = dbRows.filter((r) => r.receipts_notes?.trim()).length;

  const spotCheckPool = sheetValidRows.filter((s) => {
    const db = dbByLegacyRow.get(s.sheetRowNumber) ?? dbByKey.get(s.key);
    return Boolean(db);
  });
  const spotChecks = pickRandom(spotCheckPool, 5).map((s) => {
    const db = dbByLegacyRow.get(s.sheetRowNumber) ?? dbByKey.get(s.key);
    return {
      sheetRowNumber: s.sheetRowNumber,
      associateName: s.associateName,
      fiscalYear: s.fiscalYear,
      progressive: s.progressive,
      sheetGross: s.gross,
      dbGross: Number(db.gross_amount_eur),
      sheetReceipts: s.receiptsAmount,
      dbReceipts: Number(db.receipts_amount_eur ?? 0),
      sheetNotes: s.receiptsNotes,
      dbNotes: db.receipts_notes,
      match:
        Math.abs(Number(db.gross_amount_eur) - s.gross) <= 0.01 &&
        Math.abs(Number(db.receipts_amount_eur ?? 0) - s.receiptsAmount) <= 0.01,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    sheet: {
      totalDataRows: sheet.rows.length,
      validRows: sheetValidRows.length,
      skippedInvalid: sheetSkippedInvalid.length,
      skippedInvalidDetails: sheetSkippedInvalid,
      memberNotFound: sheetMemberNotFound.length,
      memberNotFoundDetails: sheetMemberNotFound.map((s) => ({
        sheetRowNumber: s.sheetRowNumber,
        associateName: s.associateName,
        fiscalYear: s.fiscalYear,
        progressive: s.progressive,
        gross: s.gross,
      })),
    },
    database: {
      totalRows: dbRows.length,
      fiscalYearMin: minYear,
      fiscalYearMax: maxYear,
      pdfUrlNull: pdfNullCount,
      receiptsAmountNonZero: receiptsNonZero,
      receiptsNotesNonEmpty: receiptsNotesNonEmpty,
    },
    comparison: {
      expectedInDb: sheetValidRows.length,
      missingInDb: missingInDb.length,
      missingDetails: missingInDb.map((s) => ({
        sheetRowNumber: s.sheetRowNumber,
        associateName: s.associateName,
        fiscalYear: s.fiscalYear,
        progressive: s.progressive,
      })),
      amountMismatches: amountMismatches.length,
      amountMismatchDetails: amountMismatches,
      extraInDb: extraInDb.length,
      extraInDbSample: extraInDb.slice(0, 5).map((r) => ({
        id: r.id,
        key: dbRowKey(r),
        legacy_sheet_row: r.legacy_sheet_row,
      })),
    },
    spotChecks,
    sampleDbRows: dbRows.slice(0, 5).map((r) => ({
      fiscal_year: r.fiscal_year,
      progressive: r.progressive,
      associate: memberFullName(r.members),
      gross_amount_eur: r.gross_amount_eur,
      receipts_amount_eur: r.receipts_amount_eur,
      pdf_url: r.pdf_url,
      legacy_sheet_row: r.legacy_sheet_row,
    })),
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=== Verifica import rimborsi NOTULE → Supabase ===\n");
  console.log(`Foglio NOTULE: ${sheet.rows.length} righe dati`);
  console.log(`  Valide (importabili): ${report.sheet.validRows}`);
  console.log(`  Scartate (dati incompleti): ${report.sheet.skippedInvalid}`);
  console.log(`  Associato non trovato: ${report.sheet.memberNotFound}`);
  console.log("");
  console.log(`Supabase reimbursements: ${report.database.totalRows} righe`);
  console.log(`  Anni fiscali: ${minYear ?? "—"} – ${maxYear ?? "—"}`);
  console.log(`  pdf_url NULL: ${pdfNullCount}/${dbRows.length}`);
  console.log(`  receipts_amount_eur > 0: ${receiptsNonZero}`);
  console.log(`  receipts_notes non vuote: ${receiptsNotesNonEmpty}`);
  console.log("");
  console.log(`Mancanti in DB: ${missingInDb.length}`);
  console.log(`Disallineamenti importi: ${amountMismatches.length}`);
  console.log(`Extra in DB (non nel foglio): ${extraInDb.length}`);
  console.log("");
  console.log("Spot-check (5 righe casuali):");
  for (const s of spotChecks) {
    console.log(
      `  riga ${s.sheetRowNumber} ${s.associateName} ${s.fiscalYear}/${s.progressive}: ` +
        `${s.match ? "OK" : "MISMATCH"} (lordo ${s.sheetGross} vs ${s.dbGross}, ricevute ${s.sheetReceipts} vs ${s.dbReceipts})`
    );
  }

  if (sheetMemberNotFound.length) {
    console.log("\nRighe NOTULE senza match associato:");
    for (const s of sheetMemberNotFound) {
      console.log(`  riga ${s.sheetRowNumber}: ${s.associateName} (${s.fiscalYear}/${s.progressive})`);
    }
  }

  console.log("\n(JSON completo: node scripts/verify-reimbursements-import.mjs --json)");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
