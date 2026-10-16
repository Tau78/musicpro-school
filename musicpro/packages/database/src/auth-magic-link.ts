import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

const SCHOOL_ORIGIN = "https://school.musicproeventi.it";

function schoolOrigin(): string {
  const fromEnv = (
    process.env.NEXT_PUBLIC_SCHOOL_PUBLIC_URL ||
    process.env.SCHOOL_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) return fromEnv;
  return SCHOOL_ORIGIN;
}

function serviceClient(): SupabaseClient<Database> | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function randomPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Mp${btoa(binary).replace(/[+/=]/g, "x")}!9`;
}

function userMissing(message: string): boolean {
  return /not found|no user|user not exist/i.test(message);
}

async function ensureAuthUser(
  service: SupabaseClient<Database>,
  email: string,
): Promise<boolean> {
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
    });
  const userId = created?.user?.id;
  if (!userId) {
    return Boolean(
      createError && /already|registered|exists/i.test(createError.message),
    );
  }

  const { data: members } = await service
    .from("members")
    .select("id, user_id, email")
    .eq("email", email);
  const match = (members ?? []).filter(
    (row) => row.email?.trim().toLowerCase() === email && !row.user_id,
  );
  if (match.length === 1 && match[0]) {
    await service
      .from("members")
      .update({ user_id: userId })
      .eq("id", match[0].id)
      .is("user_id", null);
  }
  return true;
}

/** Link monouso verso l'area personale. Null se Auth non risponde. */
export async function magicSignInUrl(
  email: string,
  nextPath: string,
): Promise<string | null> {
  const to = email.trim().toLowerCase();
  if (!to.includes("@")) return null;
  const service = serviceClient();
  if (!service) return null;

  const origin = schoolOrigin();
  const next =
    nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";
  const redirectTo = `${origin}/auth/callback?redirect=${encodeURIComponent(next)}`;

  const issue = () =>
    service.auth.admin.generateLink({
      type: "magiclink",
      email: to,
      options: { redirectTo },
    });

  let { data, error } = await issue();
  if (error && userMissing(error.message)) {
    const ready = await ensureAuthUser(service, to);
    if (!ready) return null;
    ({ data, error } = await issue());
  }
  if (error || !data) return null;

  const hashedToken =
    data.properties?.hashed_token?.trim() ||
    data.properties?.email_otp?.trim() ||
    "";
  if (hashedToken) {
    const params = new URLSearchParams({
      token_hash: hashedToken,
      type: "magiclink",
      next,
    });
    return `${origin}/auth/confirm?${params.toString()}`;
  }
  return data.properties?.action_link?.trim() || null;
}
