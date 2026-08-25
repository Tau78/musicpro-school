import { NextResponse } from "next/server";

import { getWebsiteAdminState, publishWebsite } from "@musicpro/database";

import { requireWebsiteAdmin } from "@/lib/admin/website-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const access = await requireWebsiteAdmin();
  if (access.error) return access.error;

  const result = await publishWebsite(access.supabase);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, message: result.errorMessage || "Pubblicazione non riuscita." },
      { status: 500 },
    );
  }

  const state = await getWebsiteAdminState(access.supabase);
  return NextResponse.json({ ok: true, ...state });
}
