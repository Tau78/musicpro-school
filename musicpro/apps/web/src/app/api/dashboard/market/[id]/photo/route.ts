import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles, updateMarketListing } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return NextResponse.json({ success: false, message: "Non autenticato." }, { status: 401 });
  }
  const { id } = await context.params;
  const owned = await supabase
    .from("market_listings")
    .select("id, status")
    .eq("id", id)
    .eq("seller_member_id", member.id)
    .maybeSingle();
  if (!owned.data || owned.data.status === "venduto" || owned.data.status === "riservato") {
    return NextResponse.json({ success: false, message: "Annuncio non modificabile." }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !ALLOWED.has(file.type) || file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, message: "Foto non valida (max 4 MB)." }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `market/${id}.${ext}`;
  const service = createServiceRoleClient();
  const uploaded = await service.storage.from("website").upload(path, new Uint8Array(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: true,
  });
  if (uploaded.error) {
    return NextResponse.json({ success: false, message: "Impossibile caricare la foto." }, { status: 400 });
  }

  await updateMarketListing(service, id, { photoPath: path });
  await supabase
    .from("market_listings")
    .update({ status: "in_revisione" })
    .eq("id", id)
    .eq("seller_member_id", member.id);
  return NextResponse.json({ success: true });
}
