import { cache } from "react";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

/** One auth+member lookup per request (layout and page share it). */
export const getAdminMember = cache(async () => {
  const supabase = await createClient();
  return getCurrentMemberWithRoles(supabase);
});
