import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDateItalian } from "./reimbursements.ts";

test("formatDateItalian accetta timestamptz e YYYY-MM-DD", () => {
  assert.equal(formatDateItalian("2026-09-02"), "02/09/2026");
  assert.equal(formatDateItalian("2026-09-02T10:15:00.000Z"), "02/09/2026");
  assert.equal(formatDateItalian(""), "—");
  assert.equal(formatDateItalian("not-a-date"), "—");
});
