const IT_CF_RE =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

const CF_MONTH: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  H: 6,
  L: 7,
  M: 8,
  P: 9,
  R: 10,
  S: 11,
  T: 12,
};

const ODD_VALUES: Record<string, number> = {
  "0": 1,
  "1": 0,
  "2": 5,
  "3": 7,
  "4": 9,
  "5": 13,
  "6": 15,
  "7": 17,
  "8": 19,
  "9": 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

const EVEN_VALUES: Record<string, number> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  H: 7,
  I: 8,
  J: 9,
  K: 10,
  L: 11,
  M: 12,
  N: 13,
  O: 14,
  P: 15,
  Q: 16,
  R: 17,
  S: 18,
  T: 19,
  U: 20,
  V: 21,
  W: 22,
  X: 23,
  Y: 24,
  Z: 25,
};

const CHECK_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeItalianTaxCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase();
}

export function isItalianTaxCodeFormatValid(cf: string): boolean {
  return IT_CF_RE.test(normalizeItalianTaxCode(cf));
}

/** Carattere di controllo codice fiscale (Agenzia Entrate). */
export function isItalianTaxCodeChecksumValid(cf: string): boolean {
  const code = normalizeItalianTaxCode(cf);
  if (!IT_CF_RE.test(code)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = code[i]!;
    sum += i % 2 === 0 ? ODD_VALUES[ch] ?? -1 : EVEN_VALUES[ch] ?? -1;
    if (sum < 0) return false;
  }
  const expected = CHECK_CHARS[sum % 26];
  return code[15] === expected;
}

export function extractBirthDateFromTaxCode(
  cf: string,
  referenceYear?: number,
): string | null {
  const code = normalizeItalianTaxCode(cf);
  if (!IT_CF_RE.test(code)) return null;

  const yy = Number.parseInt(code.slice(6, 8), 10);
  const month = CF_MONTH[code[8]!];
  if (!month) return null;

  let day = Number.parseInt(code.slice(9, 11), 10);
  if (Number.isNaN(day)) return null;
  if (day > 40) day -= 40;

  const ref = referenceYear ?? new Date().getFullYear();
  const refYy = ref % 100;
  const year = (yy <= refYy ? 2000 : 1900) + yy;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Confronto data profilo ↔ segmento data nel CF (se compilati). */
export function taxCodeMatchesBirthDate(
  cf: string,
  birthDateIso: string,
): boolean | null {
  const profileDate = birthDateIso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profileDate)) return null;

  const refYear = Number.parseInt(profileDate.slice(0, 4), 10);
  const fromCf = extractBirthDateFromTaxCode(cf, refYear);
  if (!fromCf) return null;

  if (fromCf === profileDate) return true;

  // Ambiguità secolo (es. nato 1999, CF yy=99).
  const alt1900 = extractBirthDateFromTaxCode(cf, 1999);
  const alt2000 = extractBirthDateFromTaxCode(cf, 2099);
  return alt1900 === profileDate || alt2000 === profileDate;
}
