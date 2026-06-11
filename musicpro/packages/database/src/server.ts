import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types/database";

type CookieStore = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options?: Record<string, unknown> }[],
  ) => void;
};

export function createServerClient(
  cookieStore: CookieStore,
): SupabaseClient<Database> {
  return createSupabaseServerClient<Database>(
    getSupabaseUrl("web"),
    getSupabaseAnonKey("web"),
    { cookies: cookieStore },
  ) as unknown as SupabaseClient<Database>;
}
