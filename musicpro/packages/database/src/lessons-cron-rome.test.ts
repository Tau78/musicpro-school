import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { hourInRome } from "./bookings";

test("hourInRome restituisce 0–23", () => {
  const hour = hourInRome(new Date("2026-01-15T07:30:00.000Z"));
  assert.ok(hour >= 0 && hour <= 23);
});

test("sync_lesson_wallet: assente consuma come presente (096)", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const sql = readFileSync(
    join(root, "supabase/migrations/097_absence_wallet_assente_consumes.sql"),
    "utf8",
  );
  assert.match(sql, /status IN \('presente', 'assente'\)/);
  assert.match(sql, /assente_giustificato no/);
});
