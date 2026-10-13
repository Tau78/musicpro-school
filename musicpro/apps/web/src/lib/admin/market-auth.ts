import { NextResponse } from "next/server";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageShop } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export async function requireMarketAccess() {
  const supabase = await createClient();
  const member = await getAdminMember();
  if (!member || !canManageShop(member.roles)) {
    return {
      supabase,
      member: null,
      error: NextResponse.json(
        { success: false, message: "Non autorizzato." },
        { status: 403 },
      ),
    };
  }
  return { supabase, member, error: null };
}

export function marketErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Operazione non riuscita.";
  const status = /non trovat/i.test(message) ? 404 : 400;
  return NextResponse.json({ success: false, message }, { status });
}
