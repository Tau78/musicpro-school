import { NextResponse } from "next/server";

import {
  getWebsiteDraft,
  getWebsitePublished,
  previewTokensMatch,
  toPublicWebsiteContent,
} from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const CORS_PUBLISHED = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

const CORS_PREVIEW = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_PUBLISHED });
}

export async function GET(request: Request) {
  try {
    const preview = new URL(request.url).searchParams.get("preview")?.trim() || "";
    const client = createServiceRoleClient();
    const published = await getWebsitePublished(client);

    if (preview) {
      const draft = await getWebsiteDraft(client);
      if (previewTokensMatch(draft.previewToken, preview)) {
        return NextResponse.json(
          {
            ok: true,
            content: toPublicWebsiteContent(draft, { preview: true }),
            preview: true,
          },
          { headers: CORS_PREVIEW },
        );
      }
    }

    return NextResponse.json(
      { ok: true, content: toPublicWebsiteContent(published) },
      { headers: CORS_PUBLISHED },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore.";
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: CORS_PUBLISHED },
    );
  }
}
