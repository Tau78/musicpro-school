/** Sezionali ricevuta fiscale (codice in testa: `{section}/{n}/{anno}`). */
export const FISCAL_RECEIPT_SECTION = {
  TEST: "TEST",
  SCH: "SCH",
  QUO: "QUO",
  SER: "SER",
  SAL: "SAL",
  EST: "EST",
} as const;

export type FiscalReceiptSectionCode =
  (typeof FISCAL_RECEIPT_SECTION)[keyof typeof FISCAL_RECEIPT_SECTION];

export const FISCAL_RECEIPT_SECTION_CODES: FiscalReceiptSectionCode[] = [
  FISCAL_RECEIPT_SECTION.SCH,
  FISCAL_RECEIPT_SECTION.QUO,
  FISCAL_RECEIPT_SECTION.SER,
  FISCAL_RECEIPT_SECTION.SAL,
  FISCAL_RECEIPT_SECTION.EST,
  FISCAL_RECEIPT_SECTION.TEST,
];

export const FISCAL_RECEIPT_SECTION_LABELS: Record<
  FiscalReceiptSectionCode,
  string
> = {
  TEST: "Test",
  SCH: "Scuola / lezioni",
  QUO: "Quote associative",
  SER: "Servizi / commerciale",
  SAL: "Sala prove",
  EST: "Esterni (non associati)",
};

/** Sezionali storici (2 lettere o S) → filtro admin raggruppato. */
export const FISCAL_RECEIPT_LEGACY_SECTION: Record<string, FiscalReceiptSectionCode> =
  {
    S: FISCAL_RECEIPT_SECTION.SCH,
    LE: FISCAL_RECEIPT_SECTION.SCH,
    QU: FISCAL_RECEIPT_SECTION.QUO,
    SA: FISCAL_RECEIPT_SECTION.SAL,
  };

export function fiscalReceiptSectionLabel(section: string): string {
  const key = section as FiscalReceiptSectionCode;
  if (key in FISCAL_RECEIPT_SECTION_LABELS) {
    return FISCAL_RECEIPT_SECTION_LABELS[key];
  }
  const mapped = FISCAL_RECEIPT_LEGACY_SECTION[section];
  if (mapped) return FISCAL_RECEIPT_SECTION_LABELS[mapped];
  return section;
}

export function fiscalReceiptSectionFilterCodes(
  filter: FiscalReceiptSectionCode,
): string[] {
  const legacy = Object.entries(FISCAL_RECEIPT_LEGACY_SECTION)
    .filter(([, canonical]) => canonical === filter)
    .map(([legacyCode]) => legacyCode);
  return [filter, ...legacy];
}
