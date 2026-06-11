#!/usr/bin/env node
/**
 * One-off: create members + member_annual_quotas for QUOTE rows with no ASSOCIATI match.
 * Usage: node scripts/import-quota-missing-members.mjs
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { google } from "googleapis";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const { SPREADSHEET_ID, QUOTE_SHEET_NAME } = require("./migrate-from-sheets/config.js");
const { readSheet } = require("./migrate-from-sheets/sheets-reader.js");
const { getSupabase, upsertBatched } = require("./migrate-from-sheets/supabase-client.js");
const {
  normalizeWhitespace,
  normalizeAssociateName,
  parseQuoteName,
  parseFiscalYear,
  parseEuroAmount,
  toTimestamptz,
} = require("./migrate-from-sheets/utils.js");

const TARGET_NAMES = [
  "Michela Terrosi",
  "Tony Carta",
  "Giovanni Pegoraro",
  "Nicola Parma",
];

const MIGRATION_DATE = "2026-06-11";
const MIGRATION_NOTE = `Migrato a Supabase ${MIGRATION_DATE}`;

function loadServiceAccountCredentials() {
  const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonPath) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON required");
  const resolved = path.resolve(jsonPath);
  if (!fs.existsSync(resolved)) throw new Error(`Service account file not found: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

async function getWritableSheetsClient() {
  const credentials = loadServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function targetKey(name) {
  return normalizeAssociateName(name);
}

async function getNextMemberNumber(supabase) {
  const { data, error } = await supabase
    .from("members")
    .select("member_number")
    .not("member_number", "is", null)
    .order("member_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`max member_number query failed: ${error.message}`);
  return (data?.member_number ?? 0) + 1;
}

async function findQuoteRows(sheet) {
  const targets = new Set(TARGET_NAMES.map(targetKey));
  const found = [];

  sheet.rows.forEach((row, i) => {
    const quoteNameRaw = normalizeWhitespace(row[0]);
    const key = normalizeAssociateName(quoteNameRaw);
    if (!targets.has(key)) return;

    const parsed = parseQuoteName(row[0]);
    found.push({
      sheetRowNumber: i + 2,
      quoteNameRaw,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      fiscalYear: parseFiscalYear(row[1]),
      paidAt: toTimestamptz(row[2]),
      amountPaidEur: parseEuroAmount(row[3]),
      existingNote: normalizeWhitespace(row[4] ?? ""),
    });
  });

  const foundKeys = new Set(found.map((f) => normalizeAssociateName(f.quoteNameRaw)));
  const missing = TARGET_NAMES.filter((n) => !foundKeys.has(targetKey(n)));
  if (missing.length) {
    throw new Error(`QUOTE rows not found for: ${missing.join(", ")}`);
  }

  return found;
}

async function ensureNoExistingMember(supabase, row) {
  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name")
    .ilike("first_name", row.firstName)
    .ilike("last_name", row.lastName);

  if (error) throw new Error(`member lookup failed: ${error.message}`);

  const exact = (data || []).filter(
    (m) =>
      normalizeAssociateName(`${m.first_name} ${m.last_name}`) ===
      normalizeAssociateName(`${row.firstName} ${row.lastName}`)
  );

  if (exact.length) {
    throw new Error(
      `Member already exists for "${row.quoteNameRaw}": ${exact.map((m) => m.id).join(", ")}`
    );
  }
}

async function updateQuoteSheetNotes(rows) {
  const sheets = await getWritableSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID || SPREADSHEET_ID;
  const updates = [];

  for (const row of rows) {
    const noteCell = row.existingNote
      ? `${row.existingNote}; ${MIGRATION_NOTE}`
      : MIGRATION_NOTE;
    updates.push({
      range: `'${QUOTE_SHEET_NAME}'!E${row.sheetRowNumber}`,
      values: [[noteCell]],
    });
  }

  const result = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates,
    },
  });

  return {
    updatedCells: result.data.totalUpdatedCells ?? updates.length,
    ranges: updates.map((u) => u.range),
  };
}

async function main() {
  console.log("=== Import QUOTE missing members ===\n");

  const sheet = await readSheet(QUOTE_SHEET_NAME);
  if (sheet.missing) throw new Error(`Sheet "${QUOTE_SHEET_NAME}" not found`);

  const quoteRows = await findQuoteRows(sheet);
  console.log("QUOTE rows found:");
  for (const r of quoteRows) {
    console.log(
      `  row ${r.sheetRowNumber}: ${r.quoteNameRaw} | FY ${r.fiscalYear} | paid ${r.paidAt ?? "—"} | €${r.amountPaidEur ?? "—"}`
    );
  }
  console.log("");

  const supabase = getSupabase();
  let nextNumber = await getNextMemberNumber(supabase);
  console.log(`Next member_number: ${nextNumber}\n`);

  const createdMembers = [];
  const quotaRows = [];

  for (const row of quoteRows) {
    await ensureNoExistingMember(supabase, row);

    const memberPayload = {
      first_name: row.firstName,
      last_name: row.lastName,
      is_active: true,
      member_number: nextNumber++,
    };

    const { data: member, error: memberError } = await supabase
      .from("members")
      .insert(memberPayload)
      .select("id, member_number, first_name, last_name")
      .single();

    if (memberError) {
      throw new Error(`Insert member "${row.quoteNameRaw}": ${memberError.message}`);
    }

    createdMembers.push({ ...member, sheetRowNumber: row.sheetRowNumber, quoteName: row.quoteNameRaw });

    quotaRows.push({
      member_id: member.id,
      fiscal_year: row.fiscalYear,
      paid_at: row.paidAt,
      amount_paid_eur: row.amountPaidEur,
      notes: `Manual import from QUOTE row ${row.sheetRowNumber} on ${MIGRATION_DATE}`,
    });
  }

  const quotaResult = await upsertBatched(
    "member_annual_quotas",
    quotaRows,
    "member_id,fiscal_year",
    false
  );

  let sheetUpdate = null;
  try {
    sheetUpdate = await updateQuoteSheetNotes(quoteRows);
    console.log("Google Sheet QUOTE updated (col E notes):");
    for (const range of sheetUpdate.ranges) {
      console.log(`  ${range}`);
    }
  } catch (err) {
    console.warn(`Sheet update failed (document row numbers manually): ${err.message}`);
    sheetUpdate = {
      error: err.message,
      rowNumbers: quoteRows.map((r) => r.sheetRowNumber),
    };
  }

  console.log("\n--- Results ---");
  console.log("Members created:");
  for (const m of createdMembers) {
    console.log(
      `  #${m.member_number} ${m.first_name} ${m.last_name} → ${m.id} (QUOTE row ${m.sheetRowNumber})`
    );
  }
  console.log(`\nQuota rows upserted: ${quotaResult.count}`);
  for (const q of quotaResult.data || quotaRows) {
    const member = createdMembers.find((m) => m.id === q.member_id);
    console.log(
      `  ${member?.first_name} ${member?.last_name} FY ${q.fiscal_year} → member_id ${q.member_id}`
    );
  }

  console.log("\nJSON:", JSON.stringify({ createdMembers, quotaRows: quotaResult.data || quotaRows, sheetUpdate }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
