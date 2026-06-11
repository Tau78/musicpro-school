import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types/database";

type MobileClientOptions = {
  storage?: SupabaseClientOptions<Database>["auth"] extends infer Auth
    ? Auth extends { storage?: infer Storage }
      ? Storage
      : never
    : never;
};

export function createMobileClient(
  options?: MobileClientOptions,
): SupabaseClient<Database> {
  return createClient<Database>(
    getSupabaseUrl("mobile"),
    getSupabaseAnonKey("mobile"),
    {
      auth: {
        storage: options?.storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
