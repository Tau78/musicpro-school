import assert from "node:assert/strict";
import test from "node:test";

import { parseMarketPriceEuros } from "./market";

test("accetta euro con virgola o punto", () => {
  assert.equal(parseMarketPriceEuros("150"), 15000);
  assert.equal(parseMarketPriceEuros("150,50"), 15050);
  assert.equal(parseMarketPriceEuros("1.5"), 150);
});

test("rifiuta zero, vuoto e importi assurdi", () => {
  assert.equal(parseMarketPriceEuros(""), null);
  assert.equal(parseMarketPriceEuros("0"), null);
  assert.equal(parseMarketPriceEuros("-10"), null);
  assert.equal(parseMarketPriceEuros("100000,01"), null);
});
