import assert from "node:assert/strict";
import test from "node:test";

import {
  isLastMinuteDayEnabled,
  isSlotOpenForLastMinute,
  sameInstant,
} from "./last-minute-slot.ts";

test("sameInstant accetta Z e +00:00", () => {
  assert.equal(
    sameInstant("2026-11-10T19:00:00+00:00", "2026-11-10T19:00:00.000Z"),
    true,
  );
  assert.equal(
    sameInstant("2026-11-10T19:00:00+00:00", "2026-11-10T21:00:00.000Z"),
    false,
  );
});

test("isSlotOpenForLastMinute tiene il buco sotto le 6 ore", () => {
  assert.equal(
    isSlotOpenForLastMinute({ available: false, leadTimeCategory: "too_late" }),
    true,
  );
  assert.equal(
    isSlotOpenForLastMinute({ available: true, leadTimeCategory: "auto" }),
    true,
  );
});

test("la fascia accesa basta, anche senza prenotazioni", () => {
  const schedule = {
    mon: { enabled: true },
    tue: { enabled: true },
    wed: { enabled: true },
    thu: { enabled: true },
    fri: { enabled: true },
    sat: { enabled: false },
    sun: { enabled: false },
  };
  assert.equal(isLastMinuteDayEnabled(schedule, "2026-11-13"), true);
  assert.equal(isLastMinuteDayEnabled(schedule, "2026-11-14"), false);
  assert.equal(isLastMinuteDayEnabled(schedule, "ieri"), false);
});

test("isSlotOpenForLastMinute scarta lo slot occupato", () => {
  assert.equal(
    isSlotOpenForLastMinute({
      available: false,
      bookingId: "booking-1",
      leadTimeCategory: "too_late",
    }),
    false,
  );
  assert.equal(
    isSlotOpenForLastMinute({ available: false, leadTimeCategory: "approval" }),
    false,
  );
});
