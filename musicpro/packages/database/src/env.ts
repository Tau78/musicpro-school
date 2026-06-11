function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function buildPlaceholder(value: "url" | "key"): string {
  return value === "url"
    ? "https://build-placeholder.supabase.co"
    : "build-placeholder-anon-key";
}

export function getSupabaseUrl(env: "web" | "mobile"): string {
  const url =
    env === "web"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!url) {
    if (isNextProductionBuild()) {
      return buildPlaceholder("url");
    }
    throw new Error(
      `Missing ${env === "web" ? "NEXT_PUBLIC_SUPABASE_URL" : "EXPO_PUBLIC_SUPABASE_URL"}`,
    );
  }

  return url;
}

export function getSupabaseAnonKey(env: "web" | "mobile"): string {
  const key =
    env === "web"
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    if (isNextProductionBuild()) {
      return buildPlaceholder("key");
    }
    throw new Error(
      `Missing ${env === "web" ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "EXPO_PUBLIC_SUPABASE_ANON_KEY"}`,
    );
  }

  return key;
}
