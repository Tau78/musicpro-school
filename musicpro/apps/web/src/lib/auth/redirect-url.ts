export function authCallbackUrl(redirectTo: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.SCHOOL_PUBLIC_URL ?? "https://school.musicproeventi.it";

  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  const params = new URLSearchParams({ redirect: safeRedirect });
  return `${origin}/auth/callback?${params.toString()}`;
}
