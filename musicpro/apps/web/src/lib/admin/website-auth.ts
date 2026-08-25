import { NextResponse } from "next/server";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSettings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export async function requireWebsiteAdmin() {
  const member = await getAdminMember();
  if (!member) {
    return {
      error: NextResponse.json({ ok: false, message: "Non autenticato." }, { status: 401 }),
    };
  }
  if (!canManageSettings(member.roles)) {
    return {
      error: NextResponse.json({ ok: false, message: "Non autorizzato." }, { status: 403 }),
    };
  }
  return { member, supabase: await createClient() };
}
