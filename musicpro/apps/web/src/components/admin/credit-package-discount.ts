/** Sconto di vetrina: i crediti sono il valore in euro, il prezzo è quanto si paga. */

export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** % = (crediti − euro) / crediti × 100. Null se i crediti non sono positivi. */
export function discountPercentFromPrice(
  priceEur: number,
  credits: number,
): number | null {
  if (!Number.isFinite(credits) || credits <= 0) return null;
  if (!Number.isFinite(priceEur)) return null;
  return roundCents((1 - priceEur / credits) * 100);
}

/** crediti = euro / (1 − %/100). Null se lo sconto è ≥ 100. */
export function creditsFromDiscount(
  priceEur: number,
  discountPercent: number,
): number | null {
  if (!Number.isFinite(priceEur) || priceEur < 0) return null;
  if (!Number.isFinite(discountPercent) || discountPercent >= 100) return null;
  return roundCents(priceEur / (1 - discountPercent / 100));
}

export function formatDiscountInput(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "";
  const rounded = roundCents(percent);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
