const {
  SETTINGS_SHEET_NAME,
  QUOTE_SHEET_NAME,
  ASSOCIATES_SHEET_NAME,
  START_COL_QUOTE,
  COL_INDEX,
} = require('../config');
const { readSheet } = require('../sheets-reader');
const { upsertBatched, loadMemberLookup, resolveMemberId, resolveMemberIdFromQuoteName } = require('../supabase-client');
const {
  createStats,
  normalizeWhitespace,
  normalizeAssociateName,
  normalizeTaxCode,
  parseEuroAmount,
  parseFiscalYear,
  parseInteger,
  parseSheetDate,
  toTimestamptz,
} = require('../utils');

/** 0-based index for first legacy quota column on ASSOCIATI (col S = 1-based 19) */
const LEGACY_QUOTE_START_IDX = START_COL_QUOTE - 1;

/**
 * Parse header cells from col S onwards looking for fiscal years.
 * @param {string[]} headerRow
 */
function parseLegacyQuotaYearColumns(headerRow) {
  const columns = [];
  for (let c = LEGACY_QUOTE_START_IDX; c < headerRow.length; c++) {
    const year = parseFiscalYear(headerRow[c]);
    if (year) columns.push({ colIndex: c, fiscalYear: year });
  }
  return columns;
}

/**
 * Extract quota payments from legacy ASSOCIATI wide columns.
 * @param {string[]} headerRow
 * @param {string[][]} dataRows
 * @param {Awaited<ReturnType<typeof loadMemberLookup>>} lookup
 * @param {Map<string, object>} quotaMap
 */
function mergeLegacyAssociatiQuotas(headerRow, dataRows, lookup, quotaMap) {
  const yearCols = parseLegacyQuotaYearColumns(headerRow);
  if (!yearCols.length) return;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const firstName = normalizeWhitespace(row[COL_INDEX.NOME]);
    const lastName = normalizeWhitespace(row[COL_INDEX.COGNOME]);
    if (!firstName && !lastName) continue;

    const fullName = normalizeAssociateName(`${firstName} ${lastName}`);
    const memberId = resolveMemberId(lookup, {
      fullName,
      taxCode: normalizeTaxCode(row[COL_INDEX.CODICE_FISCALE]),
      legacyRow: i + 2,
      memberNumber: parseInteger(row[COL_INDEX.NUMERO_ASSOCIATO]),
    });
    if (!memberId) continue;

    for (const { colIndex, fiscalYear } of yearCols) {
      const cell = row[colIndex];
      const paidAt = toTimestamptz(cell);
      if (!paidAt && !parseSheetDate(cell)) continue;
      if (!paidAt) continue;

      const key = `${memberId}|${fiscalYear}`;
      if (quotaMap.has(key)) continue;

      quotaMap.set(key, {
        member_id: memberId,
        fiscal_year: fiscalYear,
        paid_at: paidAt,
        amount_paid_eur: null,
        notes: 'Migrated from ASSOCIATI legacy quota columns',
      });
    }
  }
}

/**
 * @param {boolean} dryRun
 */
async function migrateQuotaSettings(dryRun) {
  const stats = createStats();
  const sheet = await readSheet(SETTINGS_SHEET_NAME);
  if (sheet.missing) {
    stats.errors.push(`Sheet "${SETTINGS_SHEET_NAME}" not found`);
    return stats;
  }

  const rows = [];
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const fiscalYear = parseFiscalYear(row[0]);
    const amount = parseEuroAmount(row[1]);
    if (!fiscalYear || amount == null) {
      stats.skipped++;
      continue;
    }
    rows.push({ fiscal_year: fiscalYear, amount_eur: amount });
  }

  if (!rows.length) return stats;

  try {
    const result = await upsertBatched(
      'annual_quota_settings',
      rows,
      'fiscal_year',
      dryRun
    );
    stats.inserted = result.count;
  } catch (err) {
    stats.errors.push(err.message);
  }

  return stats;
}

/**
 * @param {boolean} dryRun
 */
async function migrateMemberQuotas(dryRun) {
  const stats = createStats();
  const lookup = await loadMemberLookup();
  const quotaMap = new Map();

  const quoteSheet = await readSheet(QUOTE_SHEET_NAME);
  if (!quoteSheet.missing) {
    for (let i = 0; i < quoteSheet.rows.length; i++) {
      const row = quoteSheet.rows[i];
      const fullName = normalizeAssociateName(row[0]);
      const fiscalYear = parseFiscalYear(row[1]);
      const paidAt = toTimestamptz(row[2]);
      const amountPaid = parseEuroAmount(row[3]);

      if (!fullName || !fiscalYear) {
        stats.skipped++;
        stats.errors.push(`QUOTE row ${i + 2}: missing name or year`);
        continue;
      }

      const resolution = resolveMemberIdFromQuoteName(lookup, row[0]);
      const memberId = resolution.id;
      if (!memberId) {
        stats.skipped++;
        stats.errors.push(`QUOTE row ${i + 2}: member not found "${row[0]}"`);
        continue;
      }

      if (resolution.matchType && resolution.matchType !== 'exact') {
        const matched = resolution.matchedName || '(resolved)';
        console.log(
          `  QUOTE row ${i + 2}: fuzzy match [${resolution.matchType}] "${row[0]}" → ${matched}`
        );
      }

      const key = `${memberId}|${fiscalYear}`;
      quotaMap.set(key, {
        member_id: memberId,
        fiscal_year: fiscalYear,
        paid_at: paidAt,
        amount_paid_eur: amountPaid,
        notes: null,
      });
    }
  } else {
    stats.errors.push(`Sheet "${QUOTE_SHEET_NAME}" not found`);
  }

  const associatiSheet = await readSheet(ASSOCIATES_SHEET_NAME);
  if (!associatiSheet.missing && associatiSheet.header.length) {
    mergeLegacyAssociatiQuotas(
      associatiSheet.header,
      associatiSheet.rows,
      lookup,
      quotaMap
    );
  }

  const rows = [...quotaMap.values()];
  if (!rows.length) return stats;

  try {
    const result = await upsertBatched(
      'member_annual_quotas',
      rows,
      'member_id,fiscal_year',
      dryRun
    );
    stats.inserted = result.count;
  } catch (err) {
    stats.errors.push(err.message);
  }

  return stats;
}

/**
 * @param {boolean} dryRun
 */
async function migrateQuotas(dryRun) {
  const settingsStats = await migrateQuotaSettings(dryRun);
  const memberStats = await migrateMemberQuotas(dryRun);
  return {
    settings: settingsStats,
    memberQuotas: memberStats,
  };
}

module.exports = { migrateQuotas, migrateQuotaSettings, migrateMemberQuotas };
