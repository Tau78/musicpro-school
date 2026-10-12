import assert from "node:assert/strict";
import test from "node:test";

import {
  extendGridCloseMinute,
  nextCalendarView,
  prevCalendarView,
  resolvePlacedEndMinute,
  touchHorizontalSpan,
} from "./calendar-gestures";

test("nextCalendarView amplia la vista", () => {
  assert.equal(nextCalendarView("day"), "3day");
  assert.equal(nextCalendarView("3day"), "week");
  assert.equal(nextCalendarView("week"), "month");
  assert.equal(nextCalendarView("month"), null);
});

test("prevCalendarView restringe la vista", () => {
  assert.equal(prevCalendarView("month"), "week");
  assert.equal(prevCalendarView("week"), "3day");
  assert.equal(prevCalendarView("3day"), "day");
  assert.equal(prevCalendarView("day"), null);
});

test("touchHorizontalSpan", () => {
  assert.equal(
    touchHorizontalSpan({ clientX: 10 }, { clientX: 40 }),
    30,
  );
});

test("resolvePlacedEndMinute gestisce 22:00→mezzanotte", () => {
  assert.equal(resolvePlacedEndMinute(22 * 60, 0, 15), 24 * 60);
  assert.equal(resolvePlacedEndMinute(22 * 60, 23 * 60, 15), 23 * 60);
  assert.equal(resolvePlacedEndMinute(22 * 60, 22 * 60, 15), 22 * 60 + 15);
});

test("extendGridCloseMinute allunga oltre le 22", () => {
  assert.equal(extendGridCloseMinute(22 * 60, [{ endMinute: 24 * 60 }]), 24 * 60);
  assert.equal(extendGridCloseMinute(22 * 60, [{ endMinute: 22 * 60 + 30 }]), 23 * 60);
  assert.equal(extendGridCloseMinute(22 * 60, []), 22 * 60);
});
