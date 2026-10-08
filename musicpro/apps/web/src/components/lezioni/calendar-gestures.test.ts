import assert from "node:assert/strict";
import test from "node:test";

import {
  nextCalendarView,
  prevCalendarView,
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
