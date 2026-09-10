import assert from "node:assert/strict";
import { test } from "node:test";

import {
  gateCompletaInvioIscrizione,
  isIscrizioneInternalAuthorized,
  isIscrizioneProductionEnv,
} from "./internal-auth.ts";

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prev[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("isIscrizioneInternalAuthorized rejects when no secret configured", () => {
  withEnv(
    { CRON_SECRET: undefined, ISCRIZIONE_INTERNAL_SECRET: undefined },
    () => {
      const req = new Request("https://example.test", {
        headers: { authorization: "Bearer anything" },
      });
      assert.equal(isIscrizioneInternalAuthorized(req), false);
    },
  );
});

test("isIscrizioneInternalAuthorized accepts Bearer CRON_SECRET", () => {
  withEnv(
    {
      ISCRIZIONE_INTERNAL_SECRET: undefined,
      CRON_SECRET: "cron-test-secret",
    },
    () => {
      const req = new Request("https://example.test", {
        headers: { authorization: "Bearer cron-test-secret" },
      });
      assert.equal(isIscrizioneInternalAuthorized(req), true);
    },
  );
});

test("isIscrizioneInternalAuthorized prefers ISCRIZIONE_INTERNAL_SECRET", () => {
  withEnv(
    {
      CRON_SECRET: "cron-test-secret",
      ISCRIZIONE_INTERNAL_SECRET: "iscr-secret",
    },
    () => {
      const ok = new Request("https://example.test", {
        headers: { "x-iscrizione-internal-secret": "iscr-secret" },
      });
      assert.equal(isIscrizioneInternalAuthorized(ok), true);
      const cronOnly = new Request("https://example.test", {
        headers: { authorization: "Bearer cron-test-secret" },
      });
      assert.equal(isIscrizioneInternalAuthorized(cronOnly), false);
    },
  );
});

test("isIscrizioneProductionEnv true when VERCEL_ENV=production", () => {
  withEnv({ VERCEL_ENV: "production", NODE_ENV: "development" }, () => {
    assert.equal(isIscrizioneProductionEnv(), true);
  });
});

test("isIscrizioneProductionEnv true when NODE_ENV=production", () => {
  withEnv({ VERCEL_ENV: undefined, NODE_ENV: "production" }, () => {
    assert.equal(isIscrizioneProductionEnv(), true);
  });
});

test("gateCompletaInvioIscrizione: prod without secret → 503", () => {
  withEnv(
    {
      VERCEL_ENV: "production",
      NODE_ENV: "production",
      CRON_SECRET: undefined,
      ISCRIZIONE_INTERNAL_SECRET: undefined,
    },
    () => {
      const gate = gateCompletaInvioIscrizione(new Request("https://example.test"));
      assert.equal(gate.ok, false);
      if (!gate.ok) {
        assert.equal(gate.status, 503);
        assert.match(gate.message, /secret interno/i);
      }
    },
  );
});

test("gateCompletaInvioIscrizione: non-prod without secret → ok", () => {
  withEnv(
    {
      VERCEL_ENV: "development",
      NODE_ENV: "development",
      CRON_SECRET: undefined,
      ISCRIZIONE_INTERNAL_SECRET: undefined,
    },
    () => {
      const gate = gateCompletaInvioIscrizione(new Request("https://example.test"));
      assert.equal(gate.ok, true);
    },
  );
});

test("gateCompletaInvioIscrizione: secret present wrong auth → 401", () => {
  withEnv(
    {
      NODE_ENV: "development",
      VERCEL_ENV: undefined,
      CRON_SECRET: "cron-test-secret",
      ISCRIZIONE_INTERNAL_SECRET: undefined,
    },
    () => {
      const gate = gateCompletaInvioIscrizione(
        new Request("https://example.test", {
          headers: { authorization: "Bearer wrong" },
        }),
      );
      assert.equal(gate.ok, false);
      if (!gate.ok) {
        assert.equal(gate.status, 401);
        assert.equal(gate.message, "Non autorizzato");
      }
    },
  );
});

test("gateCompletaInvioIscrizione: secret present correct Bearer → ok", () => {
  withEnv(
    {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      CRON_SECRET: "cron-test-secret",
      ISCRIZIONE_INTERNAL_SECRET: undefined,
    },
    () => {
      const gate = gateCompletaInvioIscrizione(
        new Request("https://example.test", {
          headers: { authorization: "Bearer cron-test-secret" },
        }),
      );
      assert.equal(gate.ok, true);
    },
  );
});
