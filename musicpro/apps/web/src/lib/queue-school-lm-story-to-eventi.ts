import {
  type Database,
  getAppSettingValue,
  upsertAppSetting,
} from "@musicpro/database";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  digestDayColumns,
  LAST_MINUTE_IG_DIGEST_SETTING_KEY,
  loadLastMinuteDigestDays,
  parseLastMinuteIgDigestSetting,
  type LastMinuteIgDigestSetting,
} from "@/lib/last-minute-digest-story";
import { renderLastMinuteDigestPng } from "@/lib/last-minute-digest-image";

export const EVENTI_MUSICPROEVENTI_ACCOUNT_ID =
  "4d11d5ce-8f75-4b7f-8406-0bb58fb393a7";
export const EVENTI_MUSICPROEVENTI_SLUG = "musicproeventi";
export const SCHOOL_LM_STORY_LINK =
  "https://school.musicproeventi.it/prenotazioni";
export const SCHOOL_LM_MARKER_KIND = "school-last-minute";

const BUCKET = "social-story-media";
const BLOCKED_ACCOUNT_FRAGMENTS = ["cervellone"];

let loggedMissingEventiCreds = false;

type SchoolClient = SupabaseClient<Database>;

type EventiClient = SupabaseClient;

export interface PublishDigestStoriesResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  days?: Array<{
    dayRome: string;
    action: "skipped_unchanged" | "skipped_no_slots" | "queued" | "error";
    hash?: string;
    planId?: string;
    slotId?: string;
    message?: string;
  }>;
}

function resolveEventiCreds(): { url: string; key: string } {
  const url = (process.env.EVENTI_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (process.env.EVENTI_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return { url, key };
}

function logMissingEventiCredsOnce(): void {
  if (loggedMissingEventiCreds) return;
  loggedMissingEventiCreds = true;
  console.warn(
    "[school-lm-digest] EVENTI_SUPABASE_URL / EVENTI_SUPABASE_SERVICE_ROLE_KEY assenti — digest non accodato (cron School continua).",
  );
}

function isBlockedAccountSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return BLOCKED_ACCOUNT_FRAGMENTS.some((frag) => s.includes(frag));
}

function stickerHasSchoolLmMarker(stickerConfig: unknown): boolean {
  if (!Array.isArray(stickerConfig)) return false;
  return stickerConfig.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { kind?: string }).kind === SCHOOL_LM_MARKER_KIND,
  );
}

function digestDayFromSticker(stickerConfig: unknown): string | null {
  if (!Array.isArray(stickerConfig)) return null;
  for (const item of stickerConfig) {
    if (!item || typeof item !== "object") continue;
    const row = item as { kind?: string; digestDay?: string };
    if (row.kind === SCHOOL_LM_MARKER_KIND && typeof row.digestDay === "string") {
      return row.digestDay;
    }
  }
  return null;
}

async function verifyEventiAccount(eventi: EventiClient): Promise<string | null> {
  const { data, error } = await eventi
    .from("social_instagram_accounts")
    .select("id, slug, ig_username, is_active, is_default")
    .eq("id", EVENTI_MUSICPROEVENTI_ACCOUNT_ID)
    .maybeSingle();

  if (error) return error.message;
  if (!data?.id) return "Account @musicproeventi non trovato.";

  const slug = String(data.slug ?? "").toLowerCase();
  const ig = String(data.ig_username ?? "").toLowerCase();
  if (isBlockedAccountSlug(slug) || isBlockedAccountSlug(ig)) {
    return "Account Eventi bloccato (Cervellone).";
  }
  if (
    slug !== EVENTI_MUSICPROEVENTI_SLUG &&
    ig !== EVENTI_MUSICPROEVENTI_SLUG
  ) {
    return `Account id ${EVENTI_MUSICPROEVENTI_ACCOUNT_ID} non è @musicproeventi.`;
  }
  if (data.is_active === false) {
    return "@musicproeventi non attivo su Eventi.";
  }
  if (data.is_default === true && slug !== EVENTI_MUSICPROEVENTI_SLUG) {
    return "Account default Eventi non è @musicproeventi.";
  }
  return null;
}

async function cancelPendingSchoolLmForDigestDay(
  eventi: EventiClient,
  dayRome: string,
  knownPlanId?: string,
): Promise<number> {
  const planIdSet = new Set<string>();
  if (knownPlanId) planIdSet.add(knownPlanId);

  const { data: plans, error: plansError } = await eventi
    .from("social_story_plans")
    .select("id, sticker_config, image_url")
    .eq("instagram_account_id", EVENTI_MUSICPROEVENTI_ACCOUNT_ID)
    .eq("status", "active");

  if (plansError) {
    throw new Error(plansError.message);
  }

  for (const p of plans ?? []) {
    const fromSticker = digestDayFromSticker(p.sticker_config);
    if (fromSticker === dayRome) {
      planIdSet.add(p.id as string);
      continue;
    }
    const imageUrl = String(p.image_url ?? "");
    if (
      stickerHasSchoolLmMarker(p.sticker_config) &&
      imageUrl.includes(`LM-${dayRome}-digest`)
    ) {
      planIdSet.add(p.id as string);
    }
  }

  const planIds = [...planIdSet];
  if (planIds.length === 0) return 0;

  const { data: slots, error: slotsError } = await eventi
    .from("social_story_slots")
    .select("id, status")
    .in("plan_id", planIds)
    .in("status", ["pending", "failed", "partial"]);

  if (slotsError) {
    throw new Error(slotsError.message);
  }

  let cancelled = 0;
  for (const slot of slots ?? []) {
    const { error } = await eventi
      .from("social_story_slots")
      .update({
        status: "cancelled",
        meta_publish_status: "skipped",
        tiktok_publish_status: "skipped",
      })
      .eq("id", slot.id)
      .in("status", ["pending", "failed", "partial"]);
    if (!error) cancelled += 1;
  }

  for (const planId of planIds) {
    const { data: remaining, error: remErr } = await eventi
      .from("social_story_slots")
      .select("id")
      .eq("plan_id", planId)
      .in("status", ["pending", "processing", "failed", "partial"]);
    if (remErr) continue;
    if ((remaining ?? []).length === 0) {
      await eventi
        .from("social_story_plans")
        .update({ status: "cancelled" })
        .eq("id", planId)
        .eq("status", "active");
    }
  }

  return cancelled;
}

async function findPublishedSchoolLmForDay(
  eventi: EventiClient,
  dayRome: string,
): Promise<{ planId: string; slotId: string } | null> {
  const { data: plans, error: plansError } = await eventi
    .from("social_story_plans")
    .select("id, sticker_config, image_url")
    .eq("instagram_account_id", EVENTI_MUSICPROEVENTI_ACCOUNT_ID);

  if (plansError) {
    throw new Error(plansError.message);
  }

  const planIds: string[] = [];
  for (const p of plans ?? []) {
    const fromSticker = digestDayFromSticker(p.sticker_config);
    const imageUrl = String(p.image_url ?? "");
    if (
      fromSticker === dayRome ||
      (stickerHasSchoolLmMarker(p.sticker_config) &&
        imageUrl.includes(`LM-${dayRome}-digest`))
    ) {
      planIds.push(p.id as string);
    }
  }
  if (planIds.length === 0) return null;

  const { data: slots, error: slotsError } = await eventi
    .from("social_story_slots")
    .select("id, plan_id")
    .in("plan_id", planIds)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1);

  if (slotsError) {
    throw new Error(slotsError.message);
  }
  const row = slots?.[0];
  if (!row?.id || !row.plan_id) return null;
  return { planId: row.plan_id as string, slotId: row.id as string };
}

function scheduledAtUtcPlusTwoMinutes(): string {
  return new Date(Date.now() + 2 * 60 * 1000).toISOString();
}

async function queueDigestDayToEventi(
  eventi: EventiClient,
  dayRome: string,
  png: Buffer,
): Promise<{ planId: string; slotId: string; imageUrl: string }> {
  const storagePath = `images/${EVENTI_MUSICPROEVENTI_SLUG}/LM-${dayRome}-digest-auto.png`;
  const scheduledAt = scheduledAtUtcPlusTwoMinutes();

  const { error: upErr } = await eventi.storage.from(BUCKET).upload(storagePath, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) {
    throw new Error(`Upload Eventi fallito: ${upErr.message}`);
  }

  const { data: pub } = eventi.storage.from(BUCKET).getPublicUrl(storagePath);
  const imageUrl = pub?.publicUrl;
  if (!imageUrl) {
    throw new Error("getPublicUrl vuoto dopo upload Eventi.");
  }

  const stickerConfig = [
    { kind: SCHOOL_LM_MARKER_KIND, digestDay: dayRome },
    { kind: "link", url: SCHOOL_LM_STORY_LINK, x: 0.5, y: 0.88 },
  ];

  const { data: inserted, error: planErr } = await eventi
    .from("social_story_plans")
    .insert({
      image_url: imageUrl,
      media_type: "image",
      caption: null,
      mention_handles: "",
      sticker_config: stickerConfig,
      instagram_account_id: EVENTI_MUSICPROEVENTI_ACCOUNT_ID,
      tiktok_enabled: false,
      tiktok_post_options: {},
      created_by: null,
      repeat_enabled: false,
      repeat_interval: 1,
      randomize_hours: 0,
      randomize_minutes: 0,
      planning_weeks: 1,
      status: "active",
    })
    .select("id")
    .single();

  if (planErr || !inserted?.id) {
    throw new Error(planErr?.message || "Insert piano Eventi senza id.");
  }

  const { data: slot, error: slotErr } = await eventi
    .from("social_story_slots")
    .insert({
      plan_id: inserted.id,
      scheduled_at: scheduledAt,
      base_scheduled_at: scheduledAt,
      status: "pending",
      meta_publish_status: "pending",
      tiktok_publish_status: "skipped",
    })
    .select("id")
    .single();

  if (slotErr || !slot?.id) {
    await eventi.from("social_story_plans").delete().eq("id", inserted.id);
    throw new Error(slotErr?.message || "Insert slot Eventi fallito.");
  }

  return { planId: inserted.id, slotId: slot.id, imageUrl };
}

async function persistDigestSetting(
  school: SchoolClient,
  state: LastMinuteIgDigestSetting,
): Promise<void> {
  const result = await upsertAppSetting(
    school,
    LAST_MINUTE_IG_DIGEST_SETTING_KEY,
    JSON.stringify(state),
    "Fingerprint digest storie last-minute School → Eventi (JSON).",
  );
  if (!result.success) {
    throw new Error(result.errorMessage || "Salvataggio fingerprint digest fallito.");
  }
}

export async function publishSchoolLastMinuteDigestStories(
  school: SchoolClient,
): Promise<PublishDigestStoriesResult> {
  const creds = resolveEventiCreds();
  if (!creds.url || !creds.key) {
    logMissingEventiCredsOnce();
    return { success: true, skipped: true, reason: "eventi_creds_missing" };
  }

  const bundles = await loadLastMinuteDigestDays(school);
  const rawSetting = await getAppSettingValue(
    school,
    LAST_MINUTE_IG_DIGEST_SETTING_KEY,
  );
  const setting = parseLastMinuteIgDigestSetting(rawSetting);

  const eventi = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const accountError = await verifyEventiAccount(eventi);
  if (accountError) {
    console.warn("[school-lm-digest] account guard:", accountError);
    return { success: true, skipped: true, reason: "eventi_account_guard" };
  }

  const dayResults: PublishDigestStoriesResult["days"] = [];

  if (bundles.length === 0) {
    return { success: true, days: dayResults };
  }

  for (const bundle of bundles) {
    if (bundle.slots.length === 0) {
      dayResults.push({ dayRome: bundle.dayRome, action: "skipped_no_slots" });
      continue;
    }

    const previous = setting.days[bundle.dayRome];
    if (previous?.hash === bundle.hash) {
      dayResults.push({
        dayRome: bundle.dayRome,
        action: "skipped_unchanged",
        hash: bundle.hash,
        planId: previous.planId,
        slotId: previous.slotId,
      });
      continue;
    }

    if (!previous) {
      const alreadyLive = await findPublishedSchoolLmForDay(
        eventi,
        bundle.dayRome,
      );
      if (alreadyLive) {
        setting.days[bundle.dayRome] = {
          hash: bundle.hash,
          queuedAt: new Date().toISOString(),
          planId: alreadyLive.planId,
          slotId: alreadyLive.slotId,
        };
        await persistDigestSetting(school, setting);
        dayResults.push({
          dayRome: bundle.dayRome,
          action: "skipped_unchanged",
          hash: bundle.hash,
          planId: alreadyLive.planId,
          slotId: alreadyLive.slotId,
        });
        continue;
      }
    }

    try {
      await cancelPendingSchoolLmForDigestDay(
        eventi,
        bundle.dayRome,
        previous?.planId,
      );

      const columns = digestDayColumns(bundle.slots);
      const png = await renderLastMinuteDigestPng({
        dayRome: bundle.dayRome,
        columns,
      });

      const queued = await queueDigestDayToEventi(eventi, bundle.dayRome, png);
      const queuedAt = new Date().toISOString();
      setting.days[bundle.dayRome] = {
        hash: bundle.hash,
        queuedAt,
        planId: queued.planId,
        slotId: queued.slotId,
      };
      await persistDigestSetting(school, setting);

      dayResults.push({
        dayRome: bundle.dayRome,
        action: "queued",
        hash: bundle.hash,
        planId: queued.planId,
        slotId: queued.slotId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[school-lm-digest] giorno ${bundle.dayRome}:`,
        message.slice(0, 400),
      );
      dayResults.push({
        dayRome: bundle.dayRome,
        action: "error",
        hash: bundle.hash,
        message: message.slice(0, 300),
      });
    }
  }

  return { success: true, days: dayResults };
}
