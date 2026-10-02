import { describe, expect, it } from "vitest";

import {
  calendarBounds,
  dayBounds,
  parseCalendarView,
  threeDayBounds,
} from "./calendar-range";

describe("calendarBounds", () => {
  it("usa range giorno / 3 giorni / settimana", () => {
    expect(parseCalendarView("day")).toBe("day");
    expect(parseCalendarView("3day")).toBe("3day");
    expect(dayBounds("2026-10-02")).toEqual({
      from: "2026-10-02",
      to: "2026-10-03",
    });
    expect(threeDayBounds("2026-10-02")).toEqual({
      from: "2026-10-02",
      to: "2026-10-05",
    });
    expect(calendarBounds("day", "2026-10-02", false)).toEqual(
      dayBounds("2026-10-02"),
    );
    expect(calendarBounds("3day", "2026-10-02", false)).toEqual(
      threeDayBounds("2026-10-02"),
    );
    expect(calendarBounds("week", "2026-10-02", false)).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
  });
});
