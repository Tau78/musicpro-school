import { describe, expect, it } from "vitest";

import { matchRoomFromEventSummary } from "./google-calendar-colors";

const rooms = [
  { id: "r", name: "Rossa", googleCalendarColorId: "11" },
  { id: "v", name: "Verde", googleCalendarColorId: "10" },
  { id: "a", name: "Arancio", googleCalendarColorId: "6" },
  { id: "b", name: "Blu", googleCalendarColorId: "9" },
];

describe("matchRoomFromEventSummary", () => {
  it("riconosce prefissi sala nei titoli aggregati", () => {
    expect(matchRoomFromEventSummary("Rossa 1,5h - chiara", rooms)?.id).toBe(
      "r",
    );
    expect(matchRoomFromEventSummary("ROSSA - MARCO FACCIOLO", rooms)?.id).toBe(
      "r",
    );
    expect(matchRoomFromEventSummary("Arancio 2h - Moreno", rooms)?.id).toBe(
      "a",
    );
    expect(matchRoomFromEventSummary("Blu 2h - Paolo", rooms)?.id).toBe("b");
    expect(matchRoomFromEventSummary("Verde — prova", rooms)?.id).toBe("v");
  });

  it("ignora titoli senza sala", () => {
    expect(matchRoomFromEventSummary("Jacopo Caveri Batteria", rooms)).toBeNull();
    expect(matchRoomFromEventSummary(null, rooms)).toBeNull();
  });
});
