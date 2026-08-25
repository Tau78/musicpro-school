import { NextResponse } from "next/server";

import { getWebsiteAdminState, rotateWebsitePreviewToken } from "@musicpro/database";

import { requireWebsiteAdmin } from "@/lib/admin/website-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const access = await requireWebsiteAdmin();
  if (access.error) return access.error;

  const result = await rotateWebsitePreviewToken(access.supabase);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, message: result.errorMessage || "Token non aggiornato." },
      { status: 500 },
    );
  }

  const state = await getWebsiteAdminState(access.supabase);
  return NextResponse.json({ ok: true, ...state, draft: result.draft ?? state.draft });
}
