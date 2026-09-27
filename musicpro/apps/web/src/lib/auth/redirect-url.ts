export const SCHOOL_PRODUCTION_ORIGIN = "https://school.musicproeventi.it";

function trimOrigin(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/$/, "");
}

export function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin);
  }
}

export function authPublicOrigin(
  env: Record<string, string | undefined> = process.env,
  windowOrigin?: string,
): string {
  const fromEnv = trimOrigin(
    env.NEXT_PUBLIC_SCHOOL_PUBLIC_URL ??
      env.SCHOOL_PUBLIC_URL ??
      env.NEXT_PUBLIC_APP_URL,
  );
  if (fromEnv && !isLocalDevOrigin(fromEnv)) {
    return fromEnv;
  }

  const runtimeOrigin = trimOrigin(windowOrigin);
  if (runtimeOrigin && !isLocalDevOrigin(runtimeOrigin)) {
    return runtimeOrigin;
  }

  // Cloud Auth must never receive localhost: recovery emails would keep
  // pointing at the developer machine.
  return SCHOOL_PRODUCTION_ORIGIN;
}

function isAllowedSchoolOrigin(origin: string): boolean {
  return (
    origin === SCHOOL_PRODUCTION_ORIGIN ||
    origin === "https://school.musicproeventi.it"
  );
}

/** Solo path relativi interni o URL same-origin School (anti open-redirect). */
export function safeAuthNextPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!isAllowedSchoolOrigin(url.origin)) {
      return fallback;
    }
    if (url.pathname === "/auth/callback" || url.pathname === "/auth/confirm") {
      const nested =
        url.searchParams.get("redirect") || url.searchParams.get("next");
      return safeAuthNextPath(nested, fallback);
    }
    const path = `${url.pathname}${url.search}` || "/";
    return safeAuthNextPath(path, fallback);
  } catch {
    return fallback;
  }
}

export function authCallbackUrl(redirectTo: string): string {
  const origin = authPublicOrigin(
    process.env,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  const safeRedirect = safeAuthNextPath(redirectTo, "/dashboard");
  const params = new URLSearchParams({ redirect: safeRedirect });
  return `${origin}/auth/callback?${params.toString()}`;
}

/**
 * RedirectTo per email OTP/magic link: URL same-origin senza query annidate
 * (così `next={{ .RedirectTo }}` nel template non si spezza su `?`/`&`).
 */
export function authEmailRedirectTo(redirectTo: string): string {
  const origin = authPublicOrigin(
    process.env,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  return `${origin}${safeAuthNextPath(redirectTo, "/dashboard")}`;
}
