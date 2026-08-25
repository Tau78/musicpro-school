import { NextResponse } from "next/server";

import {
  getWebsiteAdminState,
  parseWebsiteHubInput,
  saveWebsiteDraft,
  WebsiteHubInputError,
} from "@musicpro/database";

import { requireWebsiteAdmin } from "@/lib/admin/website-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireWebsiteAdmin();
  if (access.error) return access.error;

  const state = await getWebsiteAdminState(access.supabase);
  return NextResponse.json({ ok: true, ...state });
}

export async function PUT(request: Request) {
  const access = await requireWebsiteAdmin();
  if (access.error) return access.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON non valido." }, { status: 400 });
  }

  let draft: ReturnType<typeof parseWebsiteHubInput>;
  try {
    draft = parseWebsiteHubInput(body);
  } catch (error) {
    const message =
      error instanceof WebsiteHubInputError ? error.message : "Documento non valido.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
  const result = await saveWebsiteDraft(access.supabase, draft);
  if (!result.success || !result.draft) {
    return NextResponse.json(
      { ok: false, message: result.errorMessage || "Salvataggio non riuscito." },
      { status: 500 },
    );
  }

  const state = await getWebsiteAdminState(access.supabase);
  return NextResponse.json({ ok: true, ...state, draft: result.draft });
}
