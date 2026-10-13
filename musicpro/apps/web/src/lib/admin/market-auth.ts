import { NextResponse } from "next/server";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSchoolMarket, isSchoolMarketDeskOnly } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export async function requireMarketAccess() {
  const supabase = await createClient();
  const member = await getAdminMember();
  if (!member || !canManageSchoolMarket(member.roles)) {
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

/** Il desk collaboratore modifica solo gli oggetti dell'associazione. */
export async function rejectPersonalMarketEdit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roles: NonNullable<Awaited<ReturnType<typeof getAdminMember>>>["roles"],
  listingId: string,
) {
  if (!isSchoolMarketDeskOnly(roles)) return null;

  const { data } = await supabase
    .from("market_listings")
    .select("seller_kind")
    .eq("id", listingId)
    .maybeSingle();

  if (data?.seller_kind === "associazione") return null;

  return NextResponse.json(
    {
      success: false,
      message: "Puoi modificare solo gli oggetti della scuola.",
    },
    { status: 403 },
  );
}

export function marketErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Operazione non riuscita.";
  const status = /non trovat/i.test(message) ? 404 : 400;
  return NextResponse.json({ success: false, message }, { status });
}
