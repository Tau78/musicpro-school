import type { SupabaseClient } from "@supabase/supabase-js";

import { getRomeDayBoundsUtc, type TimeSlot } from "./bookings";
import type { SettingsMutationResult } from "./settings";
import { upsertAppSetting } from "./settings";
import type { Database } from "./types/database";

export const OPERATIONAL_WEEK_SCHEDULE_KEY = "booking_operational_week_schedule";

/** Urgenza senza prezzo promo: da questa soglia prima dell'inizio slot. */
export const LAST_MINUTE_PHASE1_HOURS = 48;
/** Prezzo last minute in wizard: da questa soglia prima dell'inizio slot. */
export const LAST_MINUTE_PHASE2_HOURS = 12;

/** Default prodotto (percentuale su tariffa slot) finché non c'è regola admin dedicata. */
export const LAST_MINUTE_DEFAULT_DISCOUNT_PERCENT = 30;

export type LastMinuteCampaignPhase =
  | "phase1"
  | "phase2"
  | "filled"
  | "cancelled";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface OperationalDaySchedule {
  enabled: boolean;
  bandStart: string;
  bandEnd: string;
  approvalMinHoursOperational: number;
  autoConfirmMinHoursOperational: number;
}

export type OperationalWeekSchedule = Record<WeekdayKey, OperationalDaySchedule>;

export interface LastMinuteCampaign {
  id: string;
  room_id: string;
  start_at: string;
  end_at: string;
  phase: LastMinuteCampaignPhase;
  phase1_started_at: string | null;
  phase2_started_at: string | null;
  filled_at: string | null;
  created_at: string;
}

export interface LastMinuteSlotOffer {
  phase: 1 | 2;
  finalPriceEur?: number;
  campaignId?: string;
}

export type AvailabilitySlotWithLastMinute = TimeSlot & {
  lastMinute?: LastMinuteSlotOffer;
};

const WEEKDAY_KEYS: WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

type LastMinuteClient = SupabaseClient<Database>;

function defaultOperationalDay(): OperationalDaySchedule {
  return {
    enabled: false,
    bandStart: "18:00",
    bandEnd: "24:00",
    approvalMinHoursOperational: 0,
    autoConfirmMinHoursOperational: 0,
  };
}

export function defaultOperationalWeekSchedule(): OperationalWeekSchedule {
  return Object.fromEntries(
    WEEKDAY_KEYS.map((key) => [key, defaultOperationalDay()]),
  ) as OperationalWeekSchedule;
}

function parseTimeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return fallback;
  const [h, m] = trimmed.split(":").map(Number);
  if (h < 0 || h > 24 || m < 0 || m > 59) return fallback;
  if (h === 24 && m !== 0) return fallback;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizeOperationalDay(raw: unknown): OperationalDaySchedule {
  const base = defaultOperationalDay();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    bandStart: parseTimeLabel(row.bandStart, base.bandStart),
    bandEnd: parseTimeLabel(row.bandEnd, base.bandEnd),
    approvalMinHoursOperational: parseNonNegativeInt(
      row.approvalMinHoursOperational,
      base.approvalMinHoursOperational,
    ),
    autoConfirmMinHoursOperational: parseNonNegativeInt(
      row.autoConfirmMinHoursOperational,
      base.autoConfirmMinHoursOperational,
    ),
  };
}

/** Parse JSON from `app_settings.booking_operational_week_schedule` with defaults. */
export function parseOperationalWeekScheduleJson(
  raw: string | null | undefined,
): OperationalWeekSchedule {
  const schedule = defaultOperationalWeekSchedule();
  if (!raw?.trim()) return schedule;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
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

export async function getOperationalWeekSchedule(
  client: LastMinuteClient,
): Promise<OperationalWeekSchedule> {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", OPERATIONAL_WEEK_SCHEDULE_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossibile caricare calendario serata operativa: ${error.message}`,
    );
  }

  return parseOperationalWeekScheduleJson(data?.value ?? null);
}

export function validateOperationalWeekSchedule(
  schedule: OperationalWeekSchedule,
): SettingsMutationResult {
  for (const key of WEEKDAY_KEYS) {
    const row = schedule[key];
    const startParts = row.bandStart.split(":").map(Number);
    const endParts = row.bandEnd.split(":").map(Number);
    if (startParts.length !== 2 || endParts.length !== 2) {
      return { success: false, errorMessage: "Orario fascia non valido." };
    }
    const startMin = startParts[0] * 60 + startParts[1];
    const endMin =
      row.bandEnd === "24:00" ? 24 * 60 : endParts[0] * 60 + endParts[1];
    if (row.enabled && endMin <= startMin) {
      return {
        success: false,
        errorMessage: "La fine fascia deve essere dopo l'inizio.",
      };
    }
  }
  return { success: true };
}

export async function updateOperationalWeekSchedule(
  client: LastMinuteClient,
  schedule: OperationalWeekSchedule,
): Promise<SettingsMutationResult> {
  const validation = validateOperationalWeekSchedule(schedule);
  if (!validation.success) return validation;

  return upsertAppSetting(
    client,
    OPERATIONAL_WEEK_SCHEDULE_KEY,
    JSON.stringify(schedule),
    "Fasce serata operativa e soglie last minute per giorno (JSON).",
  );
}

export async function listRecentLastMinuteCampaigns(
  client: LastMinuteClient,
  limit = 5,
): Promise<LastMinuteCampaign[]> {
  const { data, error } = await client
    .from("last_minute_campaigns")
    .select(
      "id, room_id, start_at, end_at, phase, phase1_started_at, phase2_started_at, filled_at, created_at",
    )
    .in("phase", ["phase1", "phase2"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error)) return [];
    return [];
  }

  return (data ?? []) as LastMinuteCampaign[];
}

function isMissingRelation(error: { message?: string; code?: string }): boolean {
  const message = `${error.code ?? ""} ${error.message ?? ""}`;
  return (
    /last_minute_campaigns|member_last_minute_eligibility/i.test(message) &&
    /schema cache|does not exist|Could not find|PGRST205/i.test(message)
  );
}

export async function isMemberPriceEligible(
  client: LastMinuteClient,
  memberId: string | null | undefined,
): Promise<boolean> {
  if (!memberId) return false;

  const { data, error } = await client
    .from("member_last_minute_eligibility")
    .select("price_blocked_until")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return true;
    throw new Error(
      `Impossibile verificare eleggibilità last minute: ${error.message}`,
    );
  }

  if (!data?.price_blocked_until) return true;

  const blockedUntil = Date.parse(data.price_blocked_until);
  if (!Number.isFinite(blockedUntil)) return true;
  return blockedUntil <= Date.now();
}

export async function getActiveCampaignsForRoomDate(
  client: LastMinuteClient,
  roomId: string,
  dateRome: string,
): Promise<LastMinuteCampaign[]> {
  const { startUtc, endUtc } = getRomeDayBoundsUtc(dateRome);

  const { data, error } = await client
    .from("last_minute_campaigns")
    .select(
      "id, room_id, start_at, end_at, phase, phase1_started_at, phase2_started_at, filled_at, created_at",
    )
    .eq("room_id", roomId)
    .in("phase", ["phase1", "phase2"])
    .gte("start_at", startUtc)
    .lt("start_at", endUtc);

  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(
      `Impossibile caricare campagne last minute: ${error.message}`,
    );
  }

  return (data ?? []) as LastMinuteCampaign[];
}

export function computeLastMinuteFinalPriceEur(basePriceEur: number): number {
  if (!Number.isFinite(basePriceEur) || basePriceEur <= 0) {
    return basePriceEur;
  }
  const factor = 1 - LAST_MINUTE_DEFAULT_DISCOUNT_PERCENT / 100;
  return Math.round(basePriceEur * factor * 100) / 100;
}

function slotMatchesCampaign(
  slot: Pick<TimeSlot, "startAt" | "endAt">,
  campaign: LastMinuteCampaign,
): boolean {
  return (
    slot.startAt === campaign.start_at && slot.endAt === campaign.end_at
  );
}

function findCampaignForSlot(
  campaigns: LastMinuteCampaign[],
  slot: Pick<TimeSlot, "startAt" | "endAt">,
): LastMinuteCampaign | null {
  for (const campaign of campaigns) {
    if (slotMatchesCampaign(slot, campaign)) return campaign;
  }
  return null;
}

export function hoursUntilSlotStart(slotStartIso: string, now: Date): number {
  const startMs = Date.parse(slotStartIso);
  if (!Number.isFinite(startMs)) return Number.POSITIVE_INFINITY;
  return (startMs - now.getTime()) / 3_600_000;
}

/** True when slot start is within the last-minute communication window (≤48h). */
export function isWithinLastMinuteWindow(
  slotStartIso: string,
  now: Date = new Date(),
): boolean {
  const hours = hoursUntilSlotStart(slotStartIso, now);
  return hours > 0 && hours <= LAST_MINUTE_PHASE1_HOURS;
}

/**
 * Enrich availability slots with last-minute badge / promo price.
 * Blacklisted members (`memberPriceEligible === false`) never receive `lastMinute` (silent).
 */
type SlotWithOptionalLm = TimeSlot & { lastMinute?: LastMinuteSlotOffer };

function withoutLastMinute<T extends SlotWithOptionalLm>(slot: T): T {
  const copy = { ...slot };
  delete copy.lastMinute;
  return copy;
}

export function enrichAvailabilitySlots<T extends TimeSlot>(
  slots: T[],
  campaigns: LastMinuteCampaign[],
  memberPriceEligible: boolean,
  now: Date = new Date(),
): Array<T & { lastMinute?: LastMinuteSlotOffer }> {
  if (!memberPriceEligible) {
    return slots.map((slot) => withoutLastMinute(slot as SlotWithOptionalLm) as T);
  }

  return slots.map((slot) => {
    if (!slot.available) {
      return withoutLastMinute(slot as SlotWithOptionalLm) as T;
    }

    const campaign = findCampaignForSlot(campaigns, slot);
    if (!campaign || !isWithinLastMinuteWindow(slot.startAt, now)) {
      return withoutLastMinute(slot as SlotWithOptionalLm) as T;
    }

    if (campaign.phase === "phase1") {
      return {
        ...slot,
        lastMinute: { phase: 1, campaignId: campaign.id },
      };
    }

    if (campaign.phase === "phase2") {
      const offer: LastMinuteSlotOffer = {
        phase: 2,
        campaignId: campaign.id,
      };
      if (slot.priceEur != null) {
        offer.finalPriceEur = computeLastMinuteFinalPriceEur(slot.priceEur);
      }
      return { ...slot, lastMinute: offer };
    }

    return withoutLastMinute(slot as SlotWithOptionalLm) as T;
  });
}
