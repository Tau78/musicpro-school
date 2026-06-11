import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

let serviceClient: SupabaseClient<Database> | null = null;

export function createServiceRoleClient(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Config mancante: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  serviceClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return serviceClient;
}
