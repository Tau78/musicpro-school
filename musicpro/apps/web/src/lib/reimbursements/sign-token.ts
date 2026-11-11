/**
 * Magic link firma notula rimborso (app_settings, stesso pattern iscrizione).
 */
import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@musicpro/database";
import { SCHOOL_APP_URL } from "@musicpro/shared";

type Db = SupabaseClient<Database>;

const TOKEN_KEY_PREFIX = "rimborso_sign_token:";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ReimbursementSignTokenInfo = {
  reimbursementId: string;
  memberId: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
};

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");
  return SCHOOL_APP_URL.replace(/\/$/, "");
}

export async function createReimbursementSignMagicLink(
  db: Db,
  params: {
    reimbursementId: string;
    memberId: string;
    email: string;
    ttlMs?: number;
  },
): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(
    Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS),
  ).toISOString();
  const payload: ReimbursementSignTokenInfo = {
    reimbursementId: params.reimbursementId,
    memberId: params.memberId,
    email: String(params.email || "").trim().toLowerCase(),
    expiresAt,
    usedAt: null,
  };
  await db.from("app_settings").upsert({
    key: `${TOKEN_KEY_PREFIX}${token}`,
    value: JSON.stringify(payload),
    description: "Magic link firma notula rimborso",
  });
  return `${appBaseUrl()}/rimborsi/firma?token=${encodeURIComponent(token)}`;
}

export async function loadReimbursementSignToken(
  db: Db,
  token: string,
): Promise<ReimbursementSignTokenInfo | null> {
  const key = `${TOKEN_KEY_PREFIX}${String(token || "").trim()}`;
  if (!key.endsWith(token) || !token) return null;
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = JSON.parse(String(data.value)) as ReimbursementSignTokenInfo;
    if (!parsed?.reimbursementId || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isSignTokenValid(
  info: ReimbursementSignTokenInfo | null,
): { ok: true; info: ReimbursementSignTokenInfo } | { ok: false; reason: string } {
  if (!info) return { ok: false, reason: "Link non valido o scaduto." };
  if (info.usedAt) return { ok: false, reason: "Questo link è già stato usato." };
  if (new Date(info.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "Link scaduto. Chiedi un nuovo invio alla segreteria." };
  }
  return { ok: true, info };
}

export async function markReimbursementSignTokenUsed(
  db: Db,
  token: string,
): Promise<void> {
  const key = `${TOKEN_KEY_PREFIX}${String(token || "").trim()}`;
  const info = await loadReimbursementSignToken(db, token);
  if (!info) return;
  await db.from("app_settings").upsert({
    key,
    value: JSON.stringify({
      ...info,
      usedAt: new Date().toISOString(),
    }),
    description: "Magic link firma notula rimborso (usato)",
  });
}
