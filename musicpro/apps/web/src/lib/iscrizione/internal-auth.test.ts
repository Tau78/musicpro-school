import assert from "node:assert/strict";
import { test } from "node:test";

import { isIscrizioneInternalAuthorized } from "./internal-auth.ts";

test("isIscrizioneInternalAuthorized rejects when no secret configured", () => {
  const prevCron = process.env.CRON_SECRET;
  const prevIscr = process.env.ISCRIZIONE_INTERNAL_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.ISCRIZIONE_INTERNAL_SECRET;
  try {
    const req = new Request("https://example.test", {
      headers: { authorization: "Bearer anything" },
    });
    assert.equal(isIscrizioneInternalAuthorized(req), false);
  } finally {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevIscr === undefined) delete process.env.ISCRIZIONE_INTERNAL_SECRET;
    else process.env.ISCRIZIONE_INTERNAL_SECRET = prevIscr;
  }
});

test("isIscrizioneInternalAuthorized accepts Bearer CRON_SECRET", () => {
  const prevCron = process.env.CRON_SECRET;
  const prevIscr = process.env.ISCRIZIONE_INTERNAL_SECRET;
  delete process.env.ISCRIZIONE_INTERNAL_SECRET;
  process.env.CRON_SECRET = "cron-test-secret";
  try {
    const req = new Request("https://example.test", {
      headers: { authorization: "Bearer cron-test-secret" },
    });
    assert.equal(isIscrizioneInternalAuthorized(req), true);
  } finally {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevIscr === undefined) delete process.env.ISCRIZIONE_INTERNAL_SECRET;
    else process.env.ISCRIZIONE_INTERNAL_SECRET = prevIscr;
  }
});

test("isIscrizioneInternalAuthorized prefers ISCRIZIONE_INTERNAL_SECRET", () => {
  const prevCron = process.env.CRON_SECRET;
  const prevIscr = process.env.ISCRIZIONE_INTERNAL_SECRET;
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.ISCRIZIONE_INTERNAL_SECRET = "iscr-secret";
  try {
    const ok = new Request("https://example.test", {
      headers: { "x-iscrizione-internal-secret": "iscr-secret" },
    });
    assert.equal(isIscrizioneInternalAuthorized(ok), true);
    const cronOnly = new Request("https://example.test", {
      headers: { authorization: "Bearer cron-test-secret" },
    });
    assert.equal(isIscrizioneInternalAuthorized(cronOnly), false);
  } finally {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevIscr === undefined) delete process.env.ISCRIZIONE_INTERNAL_SECRET;
    else process.env.ISCRIZIONE_INTERNAL_SECRET = prevIscr;
  }
});
