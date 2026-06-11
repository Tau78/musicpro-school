const { TIMEZONE } = require('./config');

/** @typedef {{ inserted: number, updated: number, skipped: number, errors: string[] }} MigrationStats */

function createStats() {
  return { inserted: 0, updated: 0, skipped: 0, errors: [] };
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTaxCode(value) {
  const code = normalizeWhitespace(value).toUpperCase();
  return code || null;
}

function normalizeFullName(firstName, lastName) {
  return normalizeWhitespace(`${firstName} ${lastName}`).toLowerCase();
}

function normalizeAssociateName(value) {
  return normalizeWhitespace(value).toLowerCase();
}

/** Strip accents for matching only — DB values stay unchanged. */
function stripAccents(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeForMatching(value) {
  return stripAccents(normalizeAssociateName(value));
}

/**
 * QUOTE col A is a single "Nome Cognome" cell (may have double spaces).
 * @returns {{ raw: string, fullName: string, firstName: string, lastName: string, parts: string[] }}
 */
function parseQuoteName(value) {
  const raw = normalizeWhitespace(value);
  const parts = raw.split(' ').filter(Boolean);
  if (!parts.length) {
    return { raw: '', fullName: '', firstName: '', lastName: '', parts: [] };
  }
  if (parts.length === 1) {
    const fullName = normalizeAssociateName(parts[0]);
    return {
      raw,
      fullName,
      firstName: parts[0],
      lastName: parts[0],
      parts,
    };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return {
    raw,
    fullName: normalizeAssociateName(raw),
    firstName,
    lastName,
    parts,
  };
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Max edit distance allowed for cognome fuzzy match (scales slightly with length). */
function cognomeFuzzyThreshold(cognome) {
  const len = cognome.length;
  if (len <= 6) return 2;
  if (len <= 9) return 3;
  return 4;
}

/**
 * Whether QUOTE first name can refer to the member first name
 * (exact, initial, or prefix e.g. Franco → Francesco).
 */
function firstNamesCompatible(quoteFirst, memberFirst) {
  const q = normalizeForMatching(quoteFirst).replace(/\./g, '');
  const m = normalizeForMatching(memberFirst);
  if (!q || !m) return false;
  if (q === m) return true;
  if (q.length === 1) return m.charAt(0) === q;
  if (q.length <= 2) return m.charAt(0) === q.charAt(0);
  const shorter = q.length <= m.length ? q : m;
  const longer = q.length <= m.length ? m : q;
  if (shorter.length >= 3 && longer.startsWith(shorter)) return true;
  // Shared prefix (e.g. Franco ↔ Francesco)
  const prefixLen = Math.min(4, q.length, m.length);
  if (prefixLen >= 3 && q.slice(0, prefixLen) === m.slice(0, prefixLen)) return true;
  return false;
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function parseEuroAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  const cleaned = String(value)
    .replace(/[€\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseCents(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function parseFiscalYear(value) {
  const n = parseInteger(value);
  if (n && n >= 1990 && n <= 2100) return n;
  const match = String(value ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Parse Google Sheets / GAS date values (serial, ISO, dd/MM/yyyy).
 * @returns {Date|null}
 */
function parseSheetDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + value * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const str = normalizeWhitespace(value);
  if (!str) return null;

  const iso = Date.parse(str);
  if (!Number.isNaN(iso)) return new Date(iso);

  const dmy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function toTimestamptz(value) {
  const d = parseSheetDate(value);
  return d ? d.toISOString() : null;
}

function toDateOnly(value) {
  const d = parseSheetDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function parseBoolean(value) {
  const str = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!str) return false;
  return ['si', 'sì', 'yes', 'true', '1', 'x'].includes(str);
}

function parsePaymentStatus(value) {
  const raw = normalizeWhitespace(value);
  return raw ? raw.toLowerCase() : 'pending';
}

function parseJsonPayload(value) {
  const str = String(value ?? '').trim();
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return { _raw: str };
  }
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function logSheetSummary(sheetName, stats) {
  console.log(`\n--- ${sheetName} ---`);
  console.log(`  inserted/upserted: ${stats.inserted}`);
  console.log(`  skipped:           ${stats.skipped}`);
  if (stats.errors.length) {
    console.log(`  errors (${stats.errors.length}):`);
    for (const err of stats.errors.slice(0, 20)) {
      console.log(`    - ${err}`);
    }
    if (stats.errors.length > 20) {
      console.log(`    ... and ${stats.errors.length - 20} more`);
    }
  }
}

module.exports = {
  TIMEZONE,
  createStats,
  normalizeWhitespace,
  normalizeTaxCode,
  normalizeFullName,
  normalizeAssociateName,
  stripAccents,
  normalizeForMatching,
  parseQuoteName,
  levenshteinDistance,
  cognomeFuzzyThreshold,
  firstNamesCompatible,
  parseInteger,
  parseEuroAmount,
  parseCents,
  parseFiscalYear,
  parseSheetDate,
  toTimestamptz,
  toDateOnly,
  parseBoolean,
  parsePaymentStatus,
  parseJsonPayload,
  chunkArray,
  logSheetSummary,
};
