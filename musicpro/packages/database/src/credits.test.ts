import assert from "node:assert/strict";
import test from "node:test";

import { creditsForBookingPrice, sumCreditsInCirculation } from "./credits";

test("i crediti seguono il prezzo in euro, non la durata", () => {
  assert.equal(creditsForBookingPrice(20), 20);
  assert.equal(creditsForBookingPrice(26), 26);
  assert.equal(creditsForBookingPrice(30), 30);
});

test("un prezzo non valido non genera un addebito", () => {
  assert.equal(creditsForBookingPrice(0), 0);
  assert.equal(creditsForBookingPrice(Number.NaN), 0);
});

test("i centesimi del prezzo restano nel credito", () => {
  assert.equal(creditsForBookingPrice(19.5), 19.5);
  assert.equal(creditsForBookingPrice(26.25), 26.25);
  assert.equal(creditsForBookingPrice(0.5), 0.5);
});

test("in circolazione esclude gli associati test", () => {
  const summary = sumCreditsInCirculation(
    {
      real: 20,
      test: 999_999,
      empty: -1,
    },
    new Set(["test"]),
  );
  assert.equal(summary.totalAvailable, 20);
  assert.equal(summary.holdersWithBalance, 1);
});
