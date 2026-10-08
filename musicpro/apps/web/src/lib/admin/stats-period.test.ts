import assert from "node:assert/strict";
import test from "node:test";

import {
  addDaysIso,
  deltaPercent,
  previousRange,
  rangeForPreset,
  startOfWeekMonday,
  weekdayMondayIndex,
} from "./stats-period";

test("weekdayMondayIndex: 2026-10-05 is Monday", () => {
  assert.equal(weekdayMondayIndex("2026-10-05"), 0);
  assert.equal(weekdayMondayIndex("2026-10-08"), 3);
});

test("startOfWeekMonday", () => {
  assert.equal(startOfWeekMonday("2026-10-08"), "2026-10-05");
});

test("rangeForPreset week", () => {
  assert.deepEqual(rangeForPreset("week", "2026-10-08"), {
    from: "2026-10-05",
    to: "2026-10-08",
  });
});

test("previousRange same length", () => {
  assert.deepEqual(previousRange({ from: "2026-10-05", to: "2026-10-08" }), {
    from: "2026-10-01",
    to: "2026-10-04",
  });
  assert.equal(addDaysIso("2026-10-01", 3), "2026-10-04");
});

test("deltaPercent", () => {
  assert.equal(deltaPercent(12, 10), 20);
  assert.equal(deltaPercent(0, 0), 0);
  assert.equal(deltaPercent(5, 0), null);
});
