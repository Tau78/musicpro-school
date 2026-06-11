import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types/database";

export function createBrowserClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient<Database>(
    getSupabaseUrl("web"),
    getSupabaseAnonKey("web"),
  ) as unknown as SupabaseClient<Database>;
}
