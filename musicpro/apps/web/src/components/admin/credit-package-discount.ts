/** Driver del ricalcolo nel form. Non è persistito. */
export type CreditPriceDriver = "credits" | "discount";

/** Crediti e percentuali a 2 decimali. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * % = (crediti − euro) / crediti × 100.
 * Crediti non positivi → null (campo vuoto, niente NaN).
 * Prezzo 0 e crediti > 0 → 100.
 */
export function discountPercentFromPrice(
  priceEur: number,
  credits: number,
): number | null {
  if (!Number.isFinite(credits) || !Number.isFinite(priceEur) || credits <= 0) {
    return null;
  }
  return roundCents(((credits - priceEur) / credits) * 100);
}

/**
 * crediti = euro / (1 − %/100).
 * % arrotondata ≥ 100 → null: non dividere.
 */
export function creditsFromDiscount(
  priceEur: number,
  discountPercent: number,
): number | null {
  if (!Number.isFinite(priceEur) || !Number.isFinite(discountPercent)) {
    return null;
  }
  const percent = roundCents(discountPercent);
  if (percent >= 100) return null;
  const factor = 1 - percent / 100;
  if (factor === 0) return null;
  const credits = roundCents(priceEur / factor);
  if (!Number.isFinite(credits)) return null;
  return credits;
}

/** 20 resta "20"; niente 20.00. Null e non numerici → stringa vuota. */
export function formatDiscountInput(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "";
  return String(roundCents(percent));
}

/** Bozza del campo %. Vuoto o incompleto → null, così non diventa 0%. */
export function parseDiscountDraft(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "+" ||
    trimmed === "." ||
    trimmed === "-." ||
    trimmed === "+."
  ) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
