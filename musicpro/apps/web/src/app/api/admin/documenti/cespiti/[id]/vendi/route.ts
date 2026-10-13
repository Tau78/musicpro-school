import { NextResponse } from "next/server";

import {
  parseMarketPriceEuros,
  publishFixedAssetToMarket,
  updateMarketListing,
} from "@musicpro/database";

import {
  CESPITI_STORAGE_BUCKET,
  requireCespitiAccess,
} from "@/lib/admin/cespiti-auth";
import { canManageSchoolMarket } from "@/lib/admin/roles";

type RouteContext = { params: Promise<{ id: string }> };

function extensionOf(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "png" || ext === "webp" || ext === "gif") return ext;
  return "jpg";
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireCespitiAccess();
  if (access.error) return access.error;
  if (!canManageSchoolMarket(access.member.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  let body: { price?: string };
  try {
    body = (await request.json()) as { price?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const priceCents = parseMarketPriceEuros(String(body.price ?? ""));
  if (priceCents == null) {
    return NextResponse.json(
      { success: false, message: "Prezzo non valido." },
      { status: 400 },
    );
  }

  try {
    const published = await publishFixedAssetToMarket(
      access.supabase,
      id,
      priceCents,
    );

    if (!published.alreadyListed && published.photoStoragePath && access.serviceSupabase) {
      const downloaded = await access.serviceSupabase.storage
        .from(CESPITI_STORAGE_BUCKET)
        .download(published.photoStoragePath);
      if (!downloaded.error && downloaded.data) {
        const ext = extensionOf(published.photoStoragePath);
        const photoPath = `market/${published.listingId}.${ext}`;
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        const uploaded = await access.serviceSupabase.storage
          .from("website")
          .upload(photoPath, bytes, {
            contentType: downloaded.data.type || "image/jpeg",
            upsert: true,
          });
        if (!uploaded.error) {
          await updateMarketListing(access.supabase, published.listingId, {
            photoPath,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      listingId: published.listingId,
      alreadyListed: published.alreadyListed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pubblicazione non riuscita.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
