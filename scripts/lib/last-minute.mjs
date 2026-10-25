/**
 * Pure last-minute helpers (mirrors @musicpro/database/src/last-minute.ts for node --test).
 */

export const LAST_MINUTE_PHASE1_HOURS = 48;
export const LAST_MINUTE_PHASE2_HOURS = 12;
export const LAST_MINUTE_DEFAULT_DISCOUNT_PERCENT = 30;

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function defaultOperationalDay() {
  return {
    enabled: false,
    bandStart: "18:00",
    bandEnd: "24:00",
    approvalMinHoursOperational: 0,
    autoConfirmMinHoursOperational: 0,
  };
}

export function defaultOperationalWeekSchedule() {
  return Object.fromEntries(
    WEEKDAY_KEYS.map((key) => [key, defaultOperationalDay()]),
  );
}

function parseTimeLabel(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return fallback;
  const [h, m] = trimmed.split(":").map(Number);
  if (h < 0 || h > 24 || m < 0 || m > 59) return fallback;
  if (h === 24 && m !== 0) return fallback;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseNonNegativeInt(value, fallback) {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizeOperationalDay(raw) {
  const base = defaultOperationalDay();
  if (!raw || typeof raw !== "object") return base;
  return {
    enabled: raw.enabled === true,
    bandStart: parseTimeLabel(raw.bandStart, base.bandStart),
    bandEnd: parseTimeLabel(raw.bandEnd, base.bandEnd),
    approvalMinHoursOperational: parseNonNegativeInt(
      raw.approvalMinHoursOperational,
      base.approvalMinHoursOperational,
    ),
    autoConfirmMinHoursOperational: parseNonNegativeInt(
      raw.autoConfirmMinHoursOperational,
      base.autoConfirmMinHoursOperational,
    ),
  };
}

export function parseOperationalWeekScheduleJson(raw) {
  const schedule = defaultOperationalWeekSchedule();
  if (!raw?.trim()) return schedule;

  try {
    const parsed = JSON.parse(raw);
    for (const key of WEEKDAY_KEYS) {
      if (parsed[key] != null) {
        schedule[key] = normalizeOperationalDay(parsed[key]);
      }
    }
  } catch {
    return schedule;
  }

  return schedule;
}

export function computeLastMinuteFinalPriceEur(basePriceEur) {
  if (!Number.isFinite(basePriceEur) || basePriceEur <= 0) {
    return basePriceEur;
  }
  const factor = 1 - LAST_MINUTE_DEFAULT_DISCOUNT_PERCENT / 100;
  return Math.round(basePriceEur * factor * 100) / 100;
}

function slotMatchesCampaign(slot, campaign) {
  return (
    slot.startAt === campaign.start_at && slot.endAt === campaign.end_at
  );
}

function findCampaignForSlot(campaigns, slot) {
  for (const campaign of campaigns) {
    if (slotMatchesCampaign(slot, campaign)) return campaign;
  }
  return null;
}

export function hoursUntilSlotStart(slotStartIso, now) {
  const startMs = Date.parse(slotStartIso);
  if (!Number.isFinite(startMs)) return Number.POSITIVE_INFINITY;
  return (startMs - now.getTime()) / 3_600_000;
}

export function isWithinLastMinuteWindow(slotStartIso, now = new Date()) {
  const hours = hoursUntilSlotStart(slotStartIso, now);
  return hours > 0 && hours <= LAST_MINUTE_PHASE1_HOURS;
}

export function enrichAvailabilitySlots(
  slots,
  campaigns,
  memberPriceEligible,
  now = new Date(),
) {
  if (!memberPriceEligible) {
    return slots.map(({ lastMinute: _drop, ...rest }) => ({ ...rest }));
  }

  return slots.map((slot) => {
    if (!slot.available) {
      const { lastMinute: _drop, ...rest } = slot;
      return { ...rest };
    }

    const campaign = findCampaignForSlot(campaigns, slot);
    if (!campaign || !isWithinLastMinuteWindow(slot.startAt, now)) {
      const { lastMinute: _drop, ...rest } = slot;
      return { ...rest };
    }

    if (campaign.phase === "phase1") {
      return {
        ...slot,
        lastMinute: { phase: 1, campaignId: campaign.id },
      };
    }

    if (campaign.phase === "phase2") {
      const offer = { phase: 2, campaignId: campaign.id };
      if (slot.priceEur != null) {
        offer.finalPriceEur = computeLastMinuteFinalPriceEur(slot.priceEur);
      }
      return { ...slot, lastMinute: offer };
    }

    const { lastMinute: _drop, ...rest } = slot;
    return { ...rest };
  });
}
