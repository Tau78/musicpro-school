const { createClient } = require('@supabase/supabase-js');
const {
  chunkArray,
  normalizeFullName,
  normalizeAssociateName,
  normalizeForMatching,
  parseQuoteName,
  levenshteinDistance,
  cognomeFuzzyThreshold,
  firstNamesCompatible,
} = require('./utils');

let client = null;

function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * @template T
 * @param {string} table
 * @param {T[]} rows
 * @param {string} onConflict
 * @param {boolean} dryRun
 */
async function upsertRows(table, rows, onConflict, dryRun) {
  if (!rows.length) return { count: 0, data: [] };
  if (dryRun) {
    return { count: rows.length, data: rows };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: false })
    .select();

  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  return { count: data?.length ?? rows.length, data: data ?? [] };
}

/**
 * @param {string} table
 * @param {object[]} rows
 * @param {string} onConflict
 * @param {boolean} dryRun
 * @param {number} [batchSize]
 */
async function upsertBatched(table, rows, onConflict, dryRun, batchSize = 100) {
  let total = 0;
  const allData = [];
  for (const batch of chunkArray(rows, batchSize)) {
    const result = await upsertRows(table, batch, onConflict, dryRun);
    total += result.count;
    allData.push(...(result.data || []));
  }
  return { count: total, data: allData };
}

/**
 * Load all members for FK resolution after migration.
 */
async function loadMemberLookup() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('members')
    .select(
      'id, tax_code, member_number, legacy_row_number, first_name, last_name'
    );

  if (error) throw new Error(`Failed to load members: ${error.message}`);

  const byTaxCode = new Map();
  const byMemberNumber = new Map();
  const byLegacyRow = new Map();
  const byFullName = new Map();
  const byMatchingFullName = new Map();
  const byCognomeNome = new Map();
  /** @type {Map<string, typeof data>} */
  const byLastName = new Map();
  const byUniqueLastName = new Map();

  for (const m of data || []) {
    if (m.tax_code) byTaxCode.set(m.tax_code.toUpperCase(), m.id);
    if (m.member_number != null) byMemberNumber.set(m.member_number, m.id);
    if (m.legacy_row_number != null) byLegacyRow.set(m.legacy_row_number, m.id);

    const fullName = normalizeFullName(m.first_name, m.last_name);
    if (fullName) byFullName.set(fullName, m.id);

    const matchingFullName = normalizeForMatching(`${m.first_name} ${m.last_name}`);
    if (matchingFullName && !byMatchingFullName.has(matchingFullName)) {
      byMatchingFullName.set(matchingFullName, m.id);
    }

    const cognomeNome = normalizeForMatching(`${m.last_name}|${m.first_name}`);
    if (cognomeNome && !byCognomeNome.has(cognomeNome)) {
      byCognomeNome.set(cognomeNome, m.id);
    }

    const lastNameKey = normalizeForMatching(m.last_name);
    if (lastNameKey) {
      if (!byLastName.has(lastNameKey)) byLastName.set(lastNameKey, []);
      byLastName.get(lastNameKey).push(m);
    }
  }

  for (const [lastNameKey, members] of byLastName) {
    if (members.length === 1) {
      byUniqueLastName.set(lastNameKey, members[0].id);
    }
  }

  return {
    byTaxCode,
    byMemberNumber,
    byLegacyRow,
    byFullName,
    byMatchingFullName,
    byCognomeNome,
    byLastName,
    byUniqueLastName,
    all: data || [],
  };
}

function resolveMemberId(lookup, { taxCode, fullName, memberNumber, legacyRow }) {
  if (taxCode) {
    const id = lookup.byTaxCode.get(taxCode.toUpperCase());
    if (id) return id;
  }
  if (memberNumber != null) {
    const id = lookup.byMemberNumber.get(memberNumber);
    if (id) return id;
  }
  if (legacyRow != null) {
    const id = lookup.byLegacyRow.get(legacyRow);
    if (id) return id;
  }
  if (fullName) {
    const normalized = normalizeAssociateName(fullName);
    const id = lookup.byFullName.get(normalized);
    if (id) return id;

    const matchingId = lookup.byMatchingFullName.get(normalizeForMatching(fullName));
    if (matchingId) return matchingId;
  }
  return null;
}

/**
 * Resolve a QUOTE-sheet "Nome Cognome" cell to a member id.
 * Tries exact → accent-normalized → cognome|nome → initial → unique cognome → fuzzy cognome.
 * @returns {{ id: string|null, matchType: string|null, matchedName?: string }}
 */
function resolveMemberIdFromQuoteName(lookup, quoteNameString) {
  const parsed = parseQuoteName(quoteNameString);
  if (!parsed.fullName) return { id: null, matchType: null };

  const exactId = resolveMemberId(lookup, { fullName: parsed.fullName });
  if (exactId) {
    return { id: exactId, matchType: 'exact' };
  }

  const matchingFull = normalizeForMatching(parsed.raw);
  const normalizedId = lookup.byMatchingFullName.get(matchingFull);
  if (normalizedId) {
    return { id: normalizedId, matchType: 'normalized' };
  }

  const firstKey = normalizeForMatching(parsed.firstName).replace(/\./g, '');
  const lastKey = normalizeForMatching(parsed.lastName);

  const cognomeNomeId = lookup.byCognomeNome.get(`${lastKey}|${firstKey}`);
  if (cognomeNomeId) {
    return { id: cognomeNomeId, matchType: 'cognome_nome' };
  }

  const sameLastName = lookup.byLastName.get(lastKey) || [];

  if (firstKey.length <= 2) {
    const initial = firstKey.charAt(0);
    const byInitial = sameLastName.filter((m) =>
      normalizeForMatching(m.first_name).startsWith(initial)
    );
    if (byInitial.length === 1) {
      return {
        id: byInitial[0].id,
        matchType: 'cognome_initial',
        matchedName: `${byInitial[0].first_name} ${byInitial[0].last_name}`,
      };
    }
  }

  if (sameLastName.length === 1) {
    const member = sameLastName[0];
    if (firstNamesCompatible(parsed.firstName, member.first_name)) {
      return {
        id: member.id,
        matchType: 'unique_cognome',
        matchedName: `${member.first_name} ${member.last_name}`,
      };
    }
  }

  const compatible = sameLastName.filter((m) =>
    firstNamesCompatible(parsed.firstName, m.first_name)
  );
  if (compatible.length === 1) {
    const member = compatible[0];
    return {
      id: member.id,
      matchType: 'cognome_first_name',
      matchedName: `${member.first_name} ${member.last_name}`,
    };
  }

  // No fuzzy cognome: typos like Petralia/Petrolio must not cross-match different spellings.

  if (parsed.parts.length === 1) {
    const uniqueId = lookup.byUniqueLastName.get(lastKey);
    if (uniqueId) {
      return { id: uniqueId, matchType: 'unique_cognome' };
    }
  }

  return { id: null, matchType: null };
}

module.exports = {
  getSupabase,
  upsertRows,
  upsertBatched,
  loadMemberLookup,
  resolveMemberId,
  resolveMemberIdFromQuoteName,
};
