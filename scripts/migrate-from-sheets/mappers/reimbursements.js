const {
  LOG_COL_INDEX,
  LOG_SHEET_NAME,
} = require('../config');
const { readSheet } = require('../sheets-reader');
const { upsertBatched, loadMemberLookup, resolveMemberId } = require('../supabase-client');
const {
  createStats,
  normalizeWhitespace,
  normalizeAssociateName,
  parseEuroAmount,
  parseFiscalYear,
  toTimestamptz,
  toDateOnly,
} = require('../utils');

/**
 * @param {import('../supabase-client').loadMemberLookup extends Function ? Awaited<ReturnType<typeof loadMemberLookup>> : never} lookup
 * @param {string[][]} rows
 */
function mapReimbursementRows(lookup, rows) {
  const mapped = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRowNumber = i + 2;
    const associateName = normalizeWhitespace(row[LOG_COL_INDEX.NOME_ASSOCIATO]);
    const fiscalYear = parseFiscalYear(row[LOG_COL_INDEX.ANNO]);
    const progressive = normalizeWhitespace(row[LOG_COL_INDEX.PROGRESSIVO]);
    const gross = parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_LORDO]);

    if (!associateName || !fiscalYear || !progressive || !gross || gross <= 0) {
      continue;
    }

    const memberId = resolveMemberId(lookup, {
      fullName: normalizeAssociateName(associateName),
    });

    if (!memberId) {
      mapped.push({
        _error: `Row ${sheetRowNumber}: member not found for "${associateName}"`,
      });
      continue;
    }

    mapped.push({
      member_id: memberId,
      fiscal_year: fiscalYear,
      generated_at:
        toTimestamptz(row[LOG_COL_INDEX.DATA_GENERAZIONE]) || new Date().toISOString(),
      progressive,
      gross_amount_eur: gross,
      withholding_eur: parseEuroAmount(row[LOG_COL_INDEX.RITENUTA]),
      net_amount_eur: parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_NETTO]),
      payment_method:
        normalizeWhitespace(row[LOG_COL_INDEX.METODO_PAGAMENTO]) || null,
      payment_date: toDateOnly(row[LOG_COL_INDEX.DATA_PAGAMENTO]),
      receipts_amount_eur:
        parseEuroAmount(row[LOG_COL_INDEX.IMPORTO_RICEVUTE]) ?? 0,
      receipts_notes: normalizeWhitespace(row[LOG_COL_INDEX.RICEVUTE]) || null,
      pdf_url: null,
      legacy_sheet_row: sheetRowNumber,
      signature_required: true,
    });
  }

  return mapped;
}

/**
 * @param {boolean} dryRun
 */
async function migrateReimbursements(dryRun) {
  const stats = createStats();
  const sheet = await readSheet(LOG_SHEET_NAME);
  if (sheet.missing) {
    stats.errors.push(`Sheet "${LOG_SHEET_NAME}" not found`);
    return stats;
  }

  const lookup = await loadMemberLookup();
  const allMapped = mapReimbursementRows(lookup, sheet.rows);
  const valid = [];
  for (const row of allMapped) {
    if (row._error) {
      stats.errors.push(row._error);
      stats.skipped++;
    } else {
      valid.push(row);
    }
  }

  if (!valid.length) return stats;

  try {
    const chunks = [];
    const seen = new Map();
    for (const row of valid) {
      const key = `${row.member_id}|${row.fiscal_year}|${row.progressive}`;
      seen.set(key, row);
    }
    const deduped = [...seen.values()];

    const result = await upsertBatched(
      'reimbursements',
      deduped,
      'member_id,fiscal_year,progressive',
      dryRun
    );
    stats.inserted = result.count;
  } catch (err) {
    stats.errors.push(err.message);
  }

  return stats;
}

module.exports = { migrateReimbursements };
