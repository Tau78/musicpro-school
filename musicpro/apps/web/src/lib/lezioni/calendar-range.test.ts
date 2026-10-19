import { describe, expect, it } from "vitest";

import {
  calendarBounds,
  calendarIncludesNonSchool,
  calendarWeekShowsSunday,
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
    expect(calendarBounds("week", "2026-10-19", true)).toEqual({
      from: "2026-10-19",
      to: "2026-10-26",
    });
  });

  it("mostra la domenica fuori dai calendari solo scuola", () => {
    expect(
      calendarWeekShowsSunday({
        schoolSundayVisible: false,
        includesNonSchool: false,
      }),
    ).toBe(false);
    expect(
      calendarWeekShowsSunday({
        schoolSundayVisible: true,
        includesNonSchool: false,
      }),
    ).toBe(true);
    expect(
      calendarWeekShowsSunday({
        schoolSundayVisible: false,
        includesNonSchool: true,
      }),
    ).toBe(true);
    expect(
      calendarIncludesNonSchool({
        bookingsOnly: false,
        isStaff: true,
        scope: "lezioni",
      }),
    ).toBe(false);
    expect(
      calendarIncludesNonSchool({
        bookingsOnly: false,
        isStaff: true,
        scope: "tutto",
      }),
    ).toBe(true);
    expect(
      calendarIncludesNonSchool({
        bookingsOnly: true,
        isStaff: true,
        scope: "lezioni",
      }),
    ).toBe(true);
    expect(
      calendarIncludesNonSchool({
        bookingsOnly: false,
        isStaff: false,
        scope: "tutto",
      }),
    ).toBe(false);
  });
});
