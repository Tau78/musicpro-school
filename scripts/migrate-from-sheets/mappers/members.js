const {
  COL_INDEX,
  ASSOCIATES_SHEET_NAME,
} = require('../config');
const { readSheet } = require('../sheets-reader');
const { loadMemberLookup, getSupabase } = require('../supabase-client');
const {
  createStats,
  normalizeWhitespace,
  normalizeTaxCode,
  parseInteger,
  parseBoolean,
  toTimestamptz,
  toDateOnly,
} = require('../utils');

function mapMemberRow(row, sheetRowNumber) {
  const firstName = normalizeWhitespace(row[COL_INDEX.NOME]);
  const lastName = normalizeWhitespace(row[COL_INDEX.COGNOME]);
  if (!firstName && !lastName) return null;

  const taxCode = normalizeTaxCode(row[COL_INDEX.CODICE_FISCALE]);
  const memberNumber = parseInteger(row[COL_INDEX.NUMERO_ASSOCIATO]);
  const gdprConsent = parseBoolean(row[COL_INDEX.CONSENSO_GDPR]);

  return {
    member_number: memberNumber,
    enrolled_at: toTimestamptz(row[COL_INDEX.DATA_ISCRIZIONE]),
    first_name: firstName || '—',
    last_name: lastName || '—',
    birth_place: normalizeWhitespace(row[COL_INDEX.LUOGO_NASCITA]) || null,
    birth_province: normalizeWhitespace(row[COL_INDEX.PROVINCIA_NASCITA]) || null,
    birth_date: toDateOnly(row[COL_INDEX.DATA_NASCITA]),
    address_street: normalizeWhitespace(row[COL_INDEX.INDIRIZZO]) || null,
    address_postal_code: normalizeWhitespace(row[COL_INDEX.CAP]) || null,
    address_city: normalizeWhitespace(row[COL_INDEX.CITTA]) || null,
    address_province: normalizeWhitespace(row[COL_INDEX.PROVINCIA_RESIDENZA]) || null,
    tax_code: taxCode,
    phone: normalizeWhitespace(row[COL_INDEX.TELEFONO]) || null,
    email: normalizeWhitespace(row[COL_INDEX.EMAIL]) || null,
    legacy_tutor_member_number: parseInteger(row[COL_INDEX.NUMERO_TUTORE]),
    legacy_tutor_full_name:
      normalizeWhitespace(row[COL_INDEX.NOME_COMPLETO_TUTORE]) || null,
    manual_tutor_first_name:
      normalizeWhitespace(row[COL_INDEX.TUTORE_NOME_MANUALE]) || null,
    manual_tutor_last_name:
      normalizeWhitespace(row[COL_INDEX.TUTORE_COGNOME_MANUALE]) || null,
    manual_tutor_phone:
      normalizeWhitespace(row[COL_INDEX.TUTORE_CELLULARE_MANUALE]) || null,
    manual_tutor_email:
      normalizeWhitespace(row[COL_INDEX.TUTORE_EMAIL_MANUALE]) || null,
    manual_tutor_tax_code:
      normalizeTaxCode(row[COL_INDEX.TUTORE_CF_MANUALE]),
    telegram_chat_id:
      normalizeWhitespace(row[COL_INDEX.TELEGRAM_CHAT_ID]) || null,
    gdpr_consent: gdprConsent,
    gdpr_consent_at: gdprConsent ? toTimestamptz(row[COL_INDEX.DATA_ISCRIZIONE]) : null,
    legacy_row_number: sheetRowNumber,
    is_active: true,
  };
}

function dedupeByKey(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null || key === '') continue;
    const existing = map.get(key);
    // Same CF: keep the first row in ASSOCIATI (lower legacy_row_number), not the latest duplicate.
    if (
      !existing ||
      (row.legacy_row_number ?? 0) < (existing.legacy_row_number ?? 0)
    ) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

async function saveMember(supabase, row, stats) {
  const label = `Row ${row.legacy_row_number}`;

  if (row.tax_code) {
    let { error } = await supabase
      .from('members')
      .upsert(row, { onConflict: 'tax_code' });

    if (error?.message?.includes('members_member_number_key')) {
      const { member_number: _n, ...withoutNumber } = row;
      ({ error } = await supabase
        .from('members')
        .upsert(withoutNumber, { onConflict: 'tax_code' }));
    }

    if (error) {
      stats.errors.push(`${label}: ${error.message}`);
      return;
    }
    stats.inserted++;
    return;
  }

  if (row.member_number != null) {
    let { error } = await supabase
      .from('members')
      .upsert(row, { onConflict: 'member_number' });

    if (error?.message?.includes('members_member_number_key')) {
      error = await saveMemberByLegacyRow(supabase, row);
    }

    if (error) {
      stats.errors.push(`${label}: ${error.message}`);
      return;
    }
    stats.inserted++;
    return;
  }

  const legacyError = await saveMemberByLegacyRow(supabase, row);
  if (legacyError) {
    stats.errors.push(`${label}: ${legacyError.message}`);
    return;
  }
  stats.inserted++;
}

async function saveMemberByLegacyRow(supabase, row) {
  const { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('legacy_row_number', row.legacy_row_number)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('members').update(row).eq('id', existing.id);
    return error;
  }

  const { error } = await supabase.from('members').insert(row);
  return error;
}

/**
 * @param {boolean} dryRun
 */
async function migrateMembers(dryRun) {
  const stats = createStats();
  const sheet = await readSheet(ASSOCIATES_SHEET_NAME);
  if (sheet.missing) {
    stats.errors.push(`Sheet "${ASSOCIATES_SHEET_NAME}" not found`);
    return stats;
  }

  const withTax = [];
  const withNumber = [];
  const withLegacyRow = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const sheetRowNumber = i + 2;
    const mapped = mapMemberRow(sheet.rows[i], sheetRowNumber);
    if (!mapped) {
      stats.skipped++;
      continue;
    }

    if (mapped.tax_code) {
      withTax.push(mapped);
    } else if (mapped.member_number != null) {
      withNumber.push(mapped);
    } else {
      withLegacyRow.push(mapped);
    }
  }

  try {
    const taxRows = dedupeByKey(withTax, (row) => row.tax_code);
    const numberRows = dedupeByKey(withNumber, (row) => row.member_number);
    const supabase = getSupabase();

    if (dryRun) {
      stats.inserted += taxRows.length + numberRows.length + withLegacyRow.length;
    } else {
      for (const row of taxRows) {
        await saveMember(supabase, row, stats);
      }
      for (const row of numberRows) {
        await saveMember(supabase, row, stats);
      }
      for (const row of withLegacyRow) {
        const error = await saveMemberByLegacyRow(supabase, row);
        if (error) {
          stats.errors.push(`Row ${row.legacy_row_number}: ${error.message}`);
        } else {
          stats.inserted++;
        }
      }
    }
  } catch (err) {
    stats.errors.push(err.message);
  }

  if (!dryRun) {
    await migrateTutorLinks();
  }

  return stats;
}

async function migrateTutorLinks() {
  const lookup = await loadMemberLookup();
  const supabase = getSupabase();
  const links = [];

  for (const m of lookup.all) {
    if (m.legacy_tutor_member_number == null) continue;
    const tutorId = lookup.byMemberNumber.get(m.legacy_tutor_member_number);
    if (!tutorId || tutorId === m.id) continue;
    links.push({
      tutor_member_id: tutorId,
      ward_member_id: m.id,
      is_primary: true,
    });
  }

  if (!links.length) return;

  await supabase
    .from('tutor_links')
    .upsert(links, { onConflict: 'tutor_member_id,ward_member_id' });
}

module.exports = { migrateMembers, mapMemberRow };
