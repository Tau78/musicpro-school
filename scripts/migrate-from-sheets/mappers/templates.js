const { TEMPLATE_SHEET_NAME } = require('../config');
const { readSheet } = require('../sheets-reader');
const { upsertBatched } = require('../supabase-client');
const { createStats, normalizeWhitespace } = require('../utils');

/**
 * @param {boolean} dryRun
 */
async function migrateTemplates(dryRun) {
  const stats = createStats();
  const sheet = await readSheet(TEMPLATE_SHEET_NAME);
  if (sheet.missing) {
    stats.errors.push(`Sheet "${TEMPLATE_SHEET_NAME}" not found`);
    return stats;
  }

  const rows = [];
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const name = normalizeWhitespace(row[0]);
    const subject = normalizeWhitespace(row[1]);
    const body = String(row[2] ?? '').trim();

    if (!name || !subject || !body) {
      stats.skipped++;
      stats.errors.push(`TEMPLATE row ${i + 2}: incomplete template`);
      continue;
    }

    rows.push({
      name,
      subject,
      body,
      channel: 'email',
    });
  }

  if (!rows.length) return stats;

  try {
    const result = await upsertBatched(
      'message_templates',
      rows,
      'name',
      dryRun
    );
    stats.inserted = result.count;
  } catch (err) {
    stats.errors.push(err.message);
  }

  return stats;
}

module.exports = { migrateTemplates };
