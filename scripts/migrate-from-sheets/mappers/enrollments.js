const {
  ISCR_COL,
  ISCRIZIONI_SHEET_NAME,
} = require('../config');
const { readSheet } = require('../sheets-reader');
const { upsertBatched, loadMemberLookup, resolveMemberId } = require('../supabase-client');
const {
  createStats,
  normalizeWhitespace,
  normalizeTaxCode,
  parseCents,
  parseFiscalYear,
  parseBoolean,
  parsePaymentStatus,
  parseJsonPayload,
  toTimestamptz,
} = require('../utils');

function mapEnrollmentRow(row, lookup) {
  const legacyId = normalizeWhitespace(row[ISCR_COL.ID]);
  const firstName = normalizeWhitespace(row[ISCR_COL.NOME]);
  const lastName = normalizeWhitespace(row[ISCR_COL.COGNOME]);
  const email = normalizeWhitespace(row[ISCR_COL.EMAIL]);
  const fiscalYear = parseFiscalYear(row[ISCR_COL.ANNO_SOCIETARIO]);
  const amountCents = parseCents(row[ISCR_COL.IMPORTO_CENTESIMI]);

  if (!legacyId) return { _skip: true, reason: 'missing legacy_enrollment_id' };
  if (!firstName || !lastName || !email || !fiscalYear || amountCents == null) {
    return { _skip: true, reason: `incomplete row for id ${legacyId}` };
  }

  const taxCode = normalizeTaxCode(row[ISCR_COL.CF]);
  const memberId = resolveMemberId(lookup, { taxCode });

  return {
    legacy_enrollment_id: legacyId,
    member_id: memberId,
    first_name: firstName,
    last_name: lastName,
    email,
    tax_code: taxCode,
    phone: normalizeWhitespace(row[ISCR_COL.TELEFONO]) || null,
    fiscal_year: fiscalYear,
    amount_centesimi: amountCents,
    payment_status: parsePaymentStatus(row[ISCR_COL.PAGAMENTO_STATO]),
    payment_link_url:
      normalizeWhitespace(row[ISCR_COL.PAGAMENTO_LINK_URL]) || null,
    payment_link_id:
      normalizeWhitespace(row[ISCR_COL.PAGAMENTO_LINK_ID]) || null,
    payment_total_centesimi: parseCents(row[ISCR_COL.PAGAMENTO_TOTALE_CENTESIMI]),
    stripe_gross_centesimi: parseCents(row[ISCR_COL.PAGAMENTO_STRIPE_LORDO]),
    stripe_fee_centesimi: parseCents(row[ISCR_COL.PAGAMENTO_STRIPE_FEE]),
    stripe_net_centesimi: parseCents(row[ISCR_COL.PAGAMENTO_STRIPE_NETTO]),
    stripe_payment_intent_id:
      normalizeWhitespace(row[ISCR_COL.PAGAMENTO_STRIPE_PI]) || null,
    paid_at: toTimestamptz(row[ISCR_COL.PAGAMENTO_PAGATO_AT]),
    created_at: toTimestamptz(row[ISCR_COL.CREATED_AT]) || new Date().toISOString(),
    form_payload: parseJsonPayload(row[ISCR_COL.PAYLOAD_JSON]),
    pdf_url: normalizeWhitespace(row[ISCR_COL.PDF_URL]) || null,
    confirmation_email_sent: parseBoolean(row[ISCR_COL.EMAIL_CONFERMA_INVIATA]),
    confirmation_email_sent_at: parseBoolean(row[ISCR_COL.EMAIL_CONFERMA_INVIATA])
      ? toTimestamptz(row[ISCR_COL.PAGAMENTO_PAGATO_AT])
      : null,
  };
}

/**
 * @param {boolean} dryRun
 */
async function migrateEnrollments(dryRun) {
  const stats = createStats();
  const sheet = await readSheet(ISCRIZIONI_SHEET_NAME);
  if (sheet.missing) {
    stats.errors.push(`Sheet "${ISCRIZIONI_SHEET_NAME}" not found`);
    return stats;
  }

  const lookup = await loadMemberLookup();
  const rows = [];

  for (const row of sheet.rows) {
    const mapped = mapEnrollmentRow(row, lookup);
    if (mapped._skip) {
      stats.skipped++;
      if (mapped.reason) stats.errors.push(mapped.reason);
      continue;
    }
    rows.push(mapped);
  }

  if (!rows.length) return stats;

  try {
    const result = await upsertBatched(
      'enrollments',
      rows,
      'legacy_enrollment_id',
      dryRun
    );
    stats.inserted = result.count;
  } catch (err) {
    stats.errors.push(err.message);
  }

  return stats;
}

module.exports = { migrateEnrollments };
