#!/usr/bin/env node
/**
 * Backfill quote associative da Archivio Conti (fogli soci ODS).
 *
 * Default: dry-run. Scrive solo con --write.
 * Non sovrascrive una quota già presente (member_id, fiscal_year).
 * Non crea soci mancanti.
 *
 *   node scripts/import-archivio-conti-quotas.mjs
 *   node scripts/import-archivio-conti-quotas.mjs --write
 */
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const {
  getSupabase,
  loadMemberLookup,
  resolveMemberId,
  resolveMemberIdFromQuoteName,
  upsertBatched,
} = require("./migrate-from-sheets/supabase-client.js");
const { normalizeTaxCode: normCf } = require("./migrate-from-sheets/utils.js");

const PARSE_PY = path.join(__dirname, "archivio-conti", "parse_tessere.py");

function parseArgs(argv) {
  const opts = { write: false };
  for (const a of argv) {
    if (a === "--write") opts.write = true;
    else if (a === "--dry-run") opts.write = false;
  }
  return opts;
}

function parseSheets() {
  const res = spawnSync("python3", [PARSE_PY], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "parse_tessere.py failed");
  }
  return JSON.parse(res.stdout);
}

async function fetchExisting(supabase) {
  const keys = new Set();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("member_annual_quotas")
      .select("member_id, fiscal_year")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data || []) keys.add(`${row.member_id}|${row.fiscal_year}`);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return keys;
}

function cfVariants(code) {
  const cf = normCf(code);
  if (!cf) return [];
  const out = [cf];
  if (cf.includes("0") || cf.includes("O")) {
    out.push(cf.replaceAll("0", "O"));
    out.push(cf.replaceAll("O", "0"));
  }
  return [...new Set(out)];
}

function matchMember(lookup, q) {
  for (const cf of cfVariants(q.tax_code)) {
    const id = resolveMemberId(lookup, { taxCode: cf });
    if (id) return { id, matchType: "cf" };
  }
  const direct = resolveMemberIdFromQuoteName(lookup, q.full_name);
  if (direct?.id) return direct;
  if (q.first_name && q.last_name) {
    const swapped = resolveMemberIdFromQuoteName(
      lookup,
      `${q.last_name} ${q.first_name}`,
    );
    if (swapped?.id) return { ...swapped, matchType: "nome_invertito" };
  }
  return { id: null, matchType: null };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const parsed = parseSheets();
  const lookup = await loadMemberLookup();
  const supabase = getSupabase();
  const existing = await fetchExisting(supabase);

  const byYear = new Map();
  const unmatched = [];
  const already = [];
  const insertRows = [];
  const seen = new Set();

  for (const q of parsed.quotas) {
    byYear.set(q.fiscal_year, (byYear.get(q.fiscal_year) || 0) + 1);
    const hit = matchMember(lookup, q);
    if (!hit?.id) {
      unmatched.push(q);
      continue;
    }
    const key = `${hit.id}|${q.fiscal_year}`;
    if (existing.has(key) || seen.has(key)) {
      already.push({ name: q.full_name, year: q.fiscal_year });
      continue;
    }
    seen.add(key);
    const paidAt = q.paid_at
      ? `${q.paid_at}T12:00:00+01:00`
      : `${q.fiscal_year}-01-01T12:00:00+01:00`;
    const flag =
      q.raw_quota === 1 ? " cella Quota=1 segnaposto, importo 10" : "";
    const noDate = q.paid_at ? "" : " data assente, 1 gennaio";
    insertRows.push({
      member_id: hit.id,
      fiscal_year: q.fiscal_year,
      paid_at: paidAt,
      amount_paid_eur: q.amount_eur,
      amount_due_eur: q.amount_eur,
      notes: `Archivio Conti ${q.source_sheet}${flag}${noDate}`.trim(),
    });
  }

  console.log(`Fogli: ${parsed.count} quote (dopo dedup nome/CF+anno)`);
  for (const year of [...byYear.keys()].sort()) {
    console.log(`  ${year}: ${byYear.get(year)}`);
  }
  console.log(`Match da inserire: ${insertRows.length}`);
  console.log(`Già in DB:         ${already.length}`);
  console.log(`Senza socio:       ${unmatched.length}`);
  if (unmatched.length) {
    console.log("\nSenza socio (non creati):");
    for (const u of unmatched.slice(0, 40)) {
      console.log(
        `  - ${u.fiscal_year} ${u.full_name}${u.tax_code ? " " + u.tax_code : ""} (${u.source_sheet})`,
      );
    }
    if (unmatched.length > 40) console.log(`  … +${unmatched.length - 40}`);
  }

  if (!opts.write) {
    console.log("\nDry-run. Nessuna scrittura.");
    return;
  }
  if (!insertRows.length) {
    console.log("\nNiente da scrivere.");
    return;
  }
  const result = await upsertBatched(
    "member_annual_quotas",
    insertRows,
    "member_id,fiscal_year",
    false,
  );
  console.log(`\nScritte: ${result.count} → member_annual_quotas`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
