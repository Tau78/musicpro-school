import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyMessagePlaceholders,
  chunkArray,
  googleSmtpEnvConfigured,
  isPlausibleEmail,
  POSTGREST_IN_CHUNK,
  resendConfigured,
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

test("googleSmtpEnvConfigured e resendConfigured leggono env", () => {
  const prevResend = process.env.RESEND_API_KEY;
  const prevUser = process.env.GOOGLE_SMTP_USER;
  const prevPass = process.env.GOOGLE_SMTP_APP_PASSWORD;
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.GOOGLE_SMTP_USER;
    delete process.env.GOOGLE_SMTP_APP_PASSWORD;
    assert.equal(resendConfigured(), false);
    assert.equal(googleSmtpEnvConfigured(), false);

    process.env.GOOGLE_SMTP_USER = "mauro@example.com";
    process.env.GOOGLE_SMTP_APP_PASSWORD = "xxxx";
    assert.equal(googleSmtpEnvConfigured(), true);
    assert.equal(resendConfigured(), false);
  } finally {
    if (prevResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevResend;
    if (prevUser === undefined) delete process.env.GOOGLE_SMTP_USER;
    else process.env.GOOGLE_SMTP_USER = prevUser;
    if (prevPass === undefined) delete process.env.GOOGLE_SMTP_APP_PASSWORD;
    else process.env.GOOGLE_SMTP_APP_PASSWORD = prevPass;
  }
});
