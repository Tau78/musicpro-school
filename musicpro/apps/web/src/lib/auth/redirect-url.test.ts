import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SCHOOL_PRODUCTION_ORIGIN,
  authCallbackUrl,
  authEmailRedirectTo,
  authPublicOrigin,
  isLocalDevOrigin,
  safeAuthNextPath,
} from "./redirect-url.ts";

test("isLocalDevOrigin riconosce localhost e 127.0.0.1", () => {
  assert.equal(isLocalDevOrigin("http://localhost:3000"), true);
  assert.equal(isLocalDevOrigin("http://127.0.0.1:3000"), true);
  assert.equal(isLocalDevOrigin(SCHOOL_PRODUCTION_ORIGIN), false);
});

test("authPublicOrigin ignora env e window localhost", () => {
  assert.equal(
    authPublicOrigin(
      { SCHOOL_PUBLIC_URL: "http://localhost:3000" },
      "http://localhost:3000",
    ),
    SCHOOL_PRODUCTION_ORIGIN,
  );
  assert.equal(
    authPublicOrigin(
      { NEXT_PUBLIC_SCHOOL_PUBLIC_URL: SCHOOL_PRODUCTION_ORIGIN },
      "http://localhost:3000",
    ),
    SCHOOL_PRODUCTION_ORIGIN,
  );
  assert.equal(
    authPublicOrigin({}, "https://school.musicproeventi.it"),
    SCHOOL_PRODUCTION_ORIGIN,
  );
  assert.equal(
    authPublicOrigin({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }, ""),
    SCHOOL_PRODUCTION_ORIGIN,
  );
});

test("authCallbackUrl punta sempre al callback school, mai a localhost", () => {
  const previous = process.env.SCHOOL_PUBLIC_URL;
  process.env.SCHOOL_PUBLIC_URL = "http://localhost:3000";
  try {
    const url = authCallbackUrl("/reset-password");
    assert.equal(
      url,
      `${SCHOOL_PRODUCTION_ORIGIN}/auth/callback?redirect=%2Freset-password`,
    );
    assert.equal(/localhost|127\.0\.0\.1/i.test(url), false);
  } finally {
    if (previous === undefined) {
      delete process.env.SCHOOL_PUBLIC_URL;
    } else {
      process.env.SCHOOL_PUBLIC_URL = previous;
    }
  }
});

test("safeAuthNextPath blocca open-redirect", () => {
  assert.equal(safeAuthNextPath("/reset-password"), "/reset-password");
  assert.equal(safeAuthNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeAuthNextPath("//evil.example"), "/dashboard");
  assert.equal(safeAuthNextPath(null, "/reset-password"), "/reset-password");
});

test("safeAuthNextPath accetta URL School e estrae redirect dal callback", () => {
  assert.equal(
    safeAuthNextPath(`${SCHOOL_PRODUCTION_ORIGIN}/prenotazioni`),
    "/prenotazioni",
  );
  assert.equal(
    safeAuthNextPath(
      `${SCHOOL_PRODUCTION_ORIGIN}/auth/callback?redirect=%2Fprenotazioni`,
    ),
    "/prenotazioni",
  );
});

test("authEmailRedirectTo è same-origin senza query annidate", () => {
  const previous = process.env.SCHOOL_PUBLIC_URL;
  process.env.SCHOOL_PUBLIC_URL = "http://localhost:3000";
  try {
    assert.equal(
      authEmailRedirectTo("/prenotazioni"),
      `${SCHOOL_PRODUCTION_ORIGIN}/prenotazioni`,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.SCHOOL_PUBLIC_URL;
    } else {
      process.env.SCHOOL_PUBLIC_URL = previous;
    }
  }
});
