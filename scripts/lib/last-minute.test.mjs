import assert from "node:assert/strict";
import test from "node:test";

import {
  LAST_MINUTE_PHASE1_HOURS,
  LAST_MINUTE_PHASE2_HOURS,
  computeLastMinuteTotalPriceEur,
  defaultOperationalWeekSchedule,
  enrichAvailabilitySlots,
  isLastMinuteAnchorStart,
  parseOperationalWeekScheduleJson,
} from "./last-minute.mjs";

test("parseOperationalWeekScheduleJson merges partial JSON with defaults", () => {
  const raw = JSON.stringify({
    fri: {
      enabled: true,
      bandStart: "19:00",
      bandEnd: "23:30",
      approvalMinHoursOperational: 0,
      autoConfirmMinHoursOperational: 0,
    },
    bad: { enabled: true },
  });

  const schedule = parseOperationalWeekScheduleJson(raw);
  assert.equal(schedule.mon.enabled, false);
  assert.equal(schedule.mon.bandStart, "18:00");
  assert.equal(schedule.fri.enabled, true);
  assert.equal(schedule.fri.bandStart, "19:00");
  assert.equal(schedule.fri.bandEnd, "23:30");
  assert.equal(schedule.bad, undefined);
});

test("parseOperationalWeekScheduleJson invalid JSON returns defaults", () => {
  const schedule = parseOperationalWeekScheduleJson("{not-json");
  const baseline = defaultOperationalWeekSchedule();
  assert.deepEqual(schedule, baseline);
});

test("enrichAvailabilitySlots phase1 badge when eligible", () => {
  const now = new Date("2026-10-25T12:00:00.000Z");
  const slots = [
    {
      startAt: "2026-10-26T18:00:00.000Z",
      endAt: "2026-10-26T20:00:00.000Z",
      label: "20:00",
      available: true,
      priceEur: 40,
    },
  ];
  const campaigns = [
    {
      id: "camp-1",
      room_id: "room-a",
      start_at: slots[0].startAt,
      end_at: slots[0].endAt,
      phase: "phase1",
    },
  ];

  const enriched = enrichAvailabilitySlots(slots, campaigns, true, now);
  assert.equal(enriched[0].lastMinute?.phase, 1);
  assert.equal(enriched[0].lastMinute?.campaignId, "camp-1");
  assert.equal(enriched[0].lastMinute?.finalPriceEur, undefined);
});

test("enrichAvailabilitySlots phase2 adds finalPriceEur when eligible", () => {
  const now = new Date("2026-10-26T04:00:00.000Z");
  const slots = [
    {
      startAt: "2026-10-26T18:00:00.000Z",
      endAt: "2026-10-26T20:00:00.000Z",
      label: "20:00",
      available: true,
      priceEur: 50,
    },
  ];
  const campaigns = [
    {
      id: "camp-2",
      start_at: slots[0].startAt,
      end_at: slots[0].endAt,
      phase: "phase2",
    },
  ];

  const enriched = enrichAvailabilitySlots(slots, campaigns, true, now);
  assert.equal(enriched[0].lastMinute?.phase, 2);
  assert.equal(enriched[0].lastMinute?.finalPriceEur, 35);
});

test("enrichAvailabilitySlots blacklisted member stays silent", () => {
  const now = new Date("2026-10-26T04:00:00.000Z");
  const slots = [
    {
      startAt: "2026-10-26T18:00:00.000Z",
      endAt: "2026-10-26T20:00:00.000Z",
      label: "20:00",
      available: true,
      priceEur: 50,
      lastMinute: { phase: 1 },
    },
  ];
  const campaigns = [
    {
      id: "camp-3",
      start_at: slots[0].startAt,
      end_at: slots[0].endAt,
      phase: "phase2",
    },
  ];

  const enriched = enrichAvailabilitySlots(slots, campaigns, false, now);
  assert.equal(enriched[0].lastMinute, undefined);
  assert.equal(enriched[0].priceEur, 50);
});

test("product constants phase1 48h and phase2 12h", () => {
  assert.equal(LAST_MINUTE_PHASE1_HOURS, 48);
  assert.equal(LAST_MINUTE_PHASE2_HOURS, 12);
});

test("isLastMinuteAnchorStart 20:00 and 22:00 yes, 21:00 no (band 20-24)", () => {
  const schedule = defaultOperationalWeekSchedule();
  schedule.mon = {
    enabled: true,
    bandStart: "20:00",
    bandEnd: "24:00",
    approvalMinHoursOperational: 0,
    autoConfirmMinHoursOperational: 0,
  };
  const at20 = "2026-10-26T19:00:00.000Z";
  const at21 = "2026-10-26T20:00:00.000Z";
  const at22 = "2026-10-26T21:00:00.000Z";
  assert.equal(isLastMinuteAnchorStart(at20, schedule, 120), true);
  assert.equal(isLastMinuteAnchorStart(at21, schedule, 120), false);
  assert.equal(isLastMinuteAnchorStart(at22, schedule, 120), true);
});

test("computeLastMinuteTotalPriceEur 3h = 2h scontate + 1h listino", () => {
  const total3h = 90;
  const priced = computeLastMinuteTotalPriceEur(total3h, 180, 120);
  const twoH = 60;
  const oneH = 30;
  const expected =
    Math.round((twoH * 0.7 + oneH) * 100) / 100;
  assert.equal(priced, expected);
});

test("enrich skips staggered 21-23 when schedule requires anchors", () => {
  const now = new Date("2026-10-26T04:00:00.000Z");
  const schedule = defaultOperationalWeekSchedule();
  schedule.mon = {
    enabled: true,
    bandStart: "20:00",
    bandEnd: "24:00",
    approvalMinHoursOperational: 0,
    autoConfirmMinHoursOperational: 0,
  };
  const slot = {
    startAt: "2026-10-26T20:00:00.000Z",
    endAt: "2026-10-26T22:00:00.000Z",
    label: "21-23",
    available: true,
    priceEur: 50,
  };
  const campaigns = [
    {
      id: "camp-stagger",
      start_at: slot.startAt,
      end_at: slot.endAt,
      phase: "phase2",
    },
  ];
  const enriched = enrichAvailabilitySlots(
    [slot],
    campaigns,
    true,
    now,
    { operationalSchedule: schedule, anchorDurationMinutes: 120 },
  );
  assert.equal(enriched[0].lastMinute, undefined);
});
