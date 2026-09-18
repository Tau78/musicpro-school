import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyMessagePlaceholders,
  chunkArray,
  isPlausibleEmail,
  POSTGREST_IN_CHUNK,
} from "./messaging.ts";

test("chunkArray spezza gli id sotto il limite PostgREST", () => {
  const ids = Array.from({ length: 123 }, (_, i) => `id-${i}`);
  const chunks = chunkArray(ids, POSTGREST_IN_CHUNK);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]?.length, 50);
  assert.equal(chunks[1]?.length, 50);
  assert.equal(chunks[2]?.length, 23);
  assert.deepEqual(chunks.flat(), ids);
});

test("chunkArray con lista vuota o size 1", () => {
  assert.deepEqual(chunkArray([], 50), []);
  assert.deepEqual(chunkArray(["a"], 50), [["a"]]);
  assert.deepEqual(chunkArray(["a", "b"], 1), [["a"], ["b"]]);
});

test("isPlausibleEmail scarta vuoti e spazzatura", () => {
  assert.equal(isPlausibleEmail("socio@example.com"), true);
  assert.equal(isPlausibleEmail("  socio@example.com  "), true);
  assert.equal(isPlausibleEmail(""), false);
  assert.equal(isPlausibleEmail("non-un-email"), false);
  assert.equal(isPlausibleEmail("a@b"), false);
});

test("applyMessagePlaceholders sostituisce nome e numero", () => {
  assert.equal(
    applyMessagePlaceholders("Ciao {{nome}} {{cognome}} n. {{numero}}", {
      firstName: "Anna",
      lastName: "Rossi",
      memberNumber: 12,
    }),
    "Ciao Anna Rossi n. 12",
  );
});
