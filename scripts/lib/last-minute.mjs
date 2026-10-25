/**
 * Pure last-minute helpers (mirrors @musicpro/database/src/last-minute.ts for node --test).
 */

export const LAST_MINUTE_PHASE1_HOURS = 48;
export const LAST_MINUTE_PHASE2_HOURS = 12;
export const LAST_MINUTE_DEFAULT_DISCOUNT_PERCENT = 30;
export const LAST_MINUTE_ANCHOR_DURATION_MINUTES = 120;

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

function hhmmToMinutes(hhmm) {
  if (hhmm === "24:00") return 24 * 60;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const ROME_WEEKDAY_TO_KEY = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

export function romeWeekdayKeyForInstant(startAtIso) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
  }).format(new Date(startAtIso));
  return ROME_WEEKDAY_TO_KEY[label] ?? "mon";
}

function romeMinutesFromMidnight(startAtIso) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(startAtIso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isLastMinuteAnchorStart(
  startAtIso,
  schedule,
  anchorDurationMinutes = LAST_MINUTE_ANCHOR_DURATION_MINUTES,
) {
  const dayKey = romeWeekdayKeyForInstant(startAtIso);
  const day = schedule[dayKey];
  if (!day?.enabled) return false;

  const bandStart = hhmmToMinutes(day.bandStart);
  const bandEnd = hhmmToMinutes(day.bandEnd);
  const startMin = romeMinutesFromMidnight(startAtIso);
  if (startMin < bandStart || startMin + anchorDurationMinutes > bandEnd) {
    return false;
  }
  return (startMin - bandStart) % anchorDurationMinutes === 0;
}

export function isLastMinuteAnchorSlot(
  startAtIso,
  endAtIso,
  schedule,
  anchorDurationMinutes = LAST_MINUTE_ANCHOR_DURATION_MINUTES,
) {
  const slotMinutes = (Date.parse(endAtIso) - Date.parse(startAtIso)) / 60_000;
  if (slotMinutes !== anchorDurationMinutes) return false;
  return isLastMinuteAnchorStart(startAtIso, schedule, anchorDurationMinutes);
}

export function computeLastMinuteTotalPriceEur(
  slotPriceEur,
  slotDurationMinutes,
  anchorDurationMinutes = LAST_MINUTE_ANCHOR_DURATION_MINUTES,
) {
  if (!Number.isFinite(slotPriceEur) || slotPriceEur <= 0) {
    return slotPriceEur;
  }
  if (
    !Number.isFinite(slotDurationMinutes) ||
    slotDurationMinutes <= anchorDurationMinutes
  ) {
    return computeLastMinuteFinalPriceEur(slotPriceEur);
  }
  const anchorPortion =
    Math.round(
      slotPriceEur * (anchorDurationMinutes / slotDurationMinutes) * 100,
    ) / 100;
  const remainder = Math.round((slotPriceEur - anchorPortion) * 100) / 100;
  return (
    Math.round(
      (computeLastMinuteFinalPriceEur(anchorPortion) + remainder) * 100,
    ) / 100
  );
}

function anchorBlockEndIso(startAtIso, anchorDurationMinutes) {
  return new Date(
    Date.parse(startAtIso) + anchorDurationMinutes * 60_000,
  ).toISOString();
}

function findCampaignForSlot(campaigns, slot, anchorDurationMinutes) {
  const anchorEnd = anchorBlockEndIso(slot.startAt, anchorDurationMinutes);
  const slotMs = Date.parse(slot.endAt) - Date.parse(slot.startAt);
  const anchorMs = anchorDurationMinutes * 60_000;
  if (slotMs < anchorMs) return null;

  for (const campaign of campaigns) {
    if (campaign.start_at !== slot.startAt) continue;
    if (campaign.end_at !== anchorEnd) continue;
    return campaign;
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
  options,
) {
  const anchorDuration =
    options?.anchorDurationMinutes ?? LAST_MINUTE_ANCHOR_DURATION_MINUTES;
  const schedule = options?.operationalSchedule;

  if (!memberPriceEligible) {
    return slots.map(({ lastMinute: _drop, ...rest }) => ({ ...rest }));
  }

  return slots.map((slot) => {
    if (!slot.available) {
      const { lastMinute: _drop, ...rest } = slot;
      return { ...rest };
    }

    if (
      schedule &&
      !isLastMinuteAnchorStart(slot.startAt, schedule, anchorDuration)
    ) {
      const { lastMinute: _drop, ...rest } = slot;
      return { ...rest };
    }

    const campaign = findCampaignForSlot(campaigns, slot, anchorDuration);
    if (!campaign || !isWithinLastMinuteWindow(slot.startAt, now)) {
      const { lastMinute: _drop, ...rest } = slot;
      return { ...rest };
    }

    const slotDurationMinutes =
      (Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60_000;

    if (campaign.phase === "phase1") {
      return {
        ...slot,
        lastMinute: { phase: 1, campaignId: campaign.id },
      };
    }

    if (campaign.phase === "phase2") {
      const offer = { phase: 2, campaignId: campaign.id };
      if (slot.priceEur != null) {
        offer.finalPriceEur = computeLastMinuteTotalPriceEur(
          slot.priceEur,
          slotDurationMinutes,
          anchorDuration,
        );
      }
      return { ...slot, lastMinute: offer };
    }

    const { lastMinute: _drop, ...rest } = slot;
    return { ...rest };
  });
}
