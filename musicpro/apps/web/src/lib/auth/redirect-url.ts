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
  env: NodeJS.ProcessEnv = process.env,
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

export function authCallbackUrl(redirectTo: string): string {
  const origin = authPublicOrigin(
    process.env,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  const params = new URLSearchParams({ redirect: safeRedirect });
  return `${origin}/auth/callback?${params.toString()}`;
}
