import assert from "node:assert/strict";
import test from "node:test";

import {
  emailDomainError,
  isValidEmailWithDomain,
  normalizeInviteEmail,
  normalizePersonName,
} from "./email-domain";

test("accetta email con TLD", () => {
  assert.equal(isValidEmailWithDomain("Mario.Rossi@MusicProeventi.it"), true);
  assert.equal(isValidEmailWithDomain("a+band@studio.co.uk"), true);
});

test("rifiuta dominio senza TLD o malformato", () => {
  assert.equal(isValidEmailWithDomain("mario@gmail"), false);
  assert.equal(isValidEmailWithDomain("mario@"), false);
  assert.equal(isValidEmailWithDomain("mario.rossi"), false);
  assert.equal(isValidEmailWithDomain("mario@rossi..it"), false);
});

test("emailDomainError", () => {
  assert.match(emailDomainError(""), /obbligatoria/i);
  assert.match(emailDomainError("x@y"), /dominio valido/i);
  assert.equal(emailDomainError("ok@ok.it"), null);
});

test("normalizeInviteEmail e nome", () => {
  assert.equal(normalizeInviteEmail("  A@B.IT "), "a@b.it");
  assert.equal(normalizePersonName("José"), "jose");
  assert.equal(normalizePersonName("  ROSSI "), "rossi");
});
