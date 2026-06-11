import { cookies } from "next/headers";

import { createServerClient } from "@musicpro/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // setAll called from Server Component — safe to ignore
      }
    },
  });
}
