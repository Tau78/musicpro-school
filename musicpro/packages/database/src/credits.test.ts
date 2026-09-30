import assert from "node:assert/strict";
import test from "node:test";

import { creditsForBookingPrice } from "./credits";

test("i crediti seguono il prezzo in euro, non la durata", () => {
  assert.equal(creditsForBookingPrice(20), 20);
  assert.equal(creditsForBookingPrice(26), 26);
  assert.equal(creditsForBookingPrice(30), 30);
});

test("un prezzo non valido non genera un addebito", () => {
  assert.equal(creditsForBookingPrice(0), 0);
  assert.equal(creditsForBookingPrice(Number.NaN), 0);
});
