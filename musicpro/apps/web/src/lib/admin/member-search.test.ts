import assert from "node:assert/strict";
import test from "node:test";

import { memberMatchesSearch } from "./member-search";

const marco = {
  firstName: "Marco",
  lastName: "Facciolo",
  email: "marco.facciolo@gmail.com",
};

test("single token: nome or cognome", () => {
  assert.equal(memberMatchesSearch(marco, "Marco"), true);
  assert.equal(memberMatchesSearch(marco, "facci"), true);
  assert.equal(memberMatchesSearch(marco, "Rossi"), false);
});

test("full name either order", () => {
  assert.equal(memberMatchesSearch(marco, "Facciolo Marco"), true);
  assert.equal(memberMatchesSearch(marco, "Marco Facciolo"), true);
});

test("nome + iniziale cognome", () => {
  assert.equal(memberMatchesSearch(marco, "Marco f"), true);
  assert.equal(memberMatchesSearch(marco, "marco F"), true);
  assert.equal(memberMatchesSearch(marco, "f marco"), true);
});

test("email", () => {
  assert.equal(memberMatchesSearch(marco, "marco.facciolo"), true);
  assert.equal(memberMatchesSearch(marco, "gmail.com"), true);
});

test("empty query matches", () => {
  assert.equal(memberMatchesSearch(marco, "  "), true);
});
