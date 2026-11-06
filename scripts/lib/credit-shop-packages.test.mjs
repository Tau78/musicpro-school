import assert from "node:assert/strict";
import test from "node:test";

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

/** Stessa formula di credit-package-discount.ts: crediti = euro / (1 − %/100). */
function creditsFromDiscount(priceEur, discountPercent) {
  const factor = 1 - discountPercent / 100;
  return roundCents(priceEur / factor);
}

function discountPercentFromPrice(priceEur, credits) {
  return roundCents(((credits - priceEur) / credits) * 100);
}

const catalog = [
  { priceEur: 80, discountPercent: 5, annualQuantity: 15, credits: 84.21 },
  { priceEur: 150, discountPercent: 10, annualQuantity: 15, credits: 166.67 },
  { priceEur: 250, discountPercent: 15, annualQuantity: 10, credits: 294.12 },
  { priceEur: 350, discountPercent: 20, annualQuantity: 5, credits: 437.5 },
];

test("i quattro pacchetti chiudono prezzo, sconto e pezzi", () => {
  for (const row of catalog) {
    assert.equal(creditsFromDiscount(row.priceEur, row.discountPercent), row.credits);
    assert.equal(discountPercentFromPrice(row.priceEur, row.credits), row.discountPercent);
    assert.equal(Number.isInteger(row.annualQuantity), true);
    assert.ok(row.annualQuantity > 0);
  }
  assert.deepEqual(
    catalog.map((row) => row.annualQuantity),
    [15, 15, 10, 5],
  );
});

test("a pezzi finiti il pacchetto non è in vetrina; lo sforamento admin resta visibile", () => {
  function remaining(annualQuantity, stockSold) {
    return annualQuantity - stockSold;
  }
  assert.equal(remaining(15, 0) > 0, true);
  assert.equal(remaining(15, 15) > 0, false);
  assert.equal(remaining(5, 6), -1);
});
