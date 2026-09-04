/** Origine pubblica School. Mai localhost in email o link utente cloud. */
export const SCHOOL_PRODUCTION_ORIGIN = 'https://school.musicproeventi.it';

export type EdgeUrlEnv = {
  BOOKING_EMAIL_APP_URL?: string;
  SCHOOL_PUBLIC_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  APP_URL?: string;
  SITE_URL?: string;
  SUPABASE_URL?: string;
};

function trimOrigin(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/$/, '');
}

export function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin);
  }
}

export function isLocalEdgeRuntime(env: EdgeUrlEnv): boolean {
  const supabaseUrl = trimOrigin(env.SUPABASE_URL);
  return Boolean(supabaseUrl) && isLocalDevOrigin(supabaseUrl);
}

function firstPublicOrigin(candidates: Array<string | undefined>): string | null {
  for (const raw of candidates) {
    const origin = trimOrigin(raw);
    if (origin && !isLocalDevOrigin(origin)) return origin;
  }
  return null;
}

/**
 * URL per email, calendario e redirect utente.
 * Ignora env localhost/127.0.0.1 anche se impostati sui secret cloud.
 */
export function publicSchoolUrl(env: EdgeUrlEnv): string {
  return (
    firstPublicOrigin([
      env.BOOKING_EMAIL_APP_URL,
      env.SCHOOL_PUBLIC_URL,
      env.NEXT_PUBLIC_APP_URL,
      env.APP_URL,
    ]) ?? SCHOOL_PRODUCTION_ORIGIN
  );
}

/**
 * URL per chiamate server-to-server (es. webhook → API Next).
 * Localhost solo se SUPABASE_URL è già locale.
 */
export function internalAppUrl(env: EdgeUrlEnv): string {
  const candidates = [
    env.NEXT_PUBLIC_APP_URL,
    env.SITE_URL,
    env.SCHOOL_PUBLIC_URL,
    env.APP_URL,
  ];
  if (isLocalEdgeRuntime(env)) {
    for (const raw of candidates) {
      const origin = trimOrigin(raw);
      if (origin) return origin;
    }
  }
  return firstPublicOrigin(candidates) ?? SCHOOL_PRODUCTION_ORIGIN;
}

export function edgeUrlEnvFromDeno(): EdgeUrlEnv {
  return {
    BOOKING_EMAIL_APP_URL: Deno.env.get('BOOKING_EMAIL_APP_URL'),
    SCHOOL_PUBLIC_URL: Deno.env.get('SCHOOL_PUBLIC_URL'),
    NEXT_PUBLIC_APP_URL: Deno.env.get('NEXT_PUBLIC_APP_URL'),
    APP_URL: Deno.env.get('APP_URL'),
    SITE_URL: Deno.env.get('SITE_URL'),
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  };
}
