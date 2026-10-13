import { NextResponse } from "next/server";

import {
  createAssociateListing,
  getCurrentMemberWithRoles,
  parseMarketPriceEuros,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return NextResponse.json({ success: false, message: "Non autenticato." }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    price?: string;
    phone?: string;
    email?: string;
    handover?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Richiesta non valida." }, { status: 400 });
  }

  const priceCents = parseMarketPriceEuros(String(body.price ?? ""));
  if (priceCents == null) {
    return NextResponse.json({ success: false, message: "Prezzo non valido." }, { status: 400 });
  }
  const handover = body.handover === "diretto" ? "diretto" : body.handover === "sede" ? "sede" : null;
  if (!handover) {
    return NextResponse.json({ success: false, message: "Scegli il ritiro." }, { status: 400 });
  }

  try {
    const listing = await createAssociateListing(supabase, {
      memberId: member.id,
      sellerName: `${member.firstName} ${member.lastName}`.trim(),
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      priceCents,
      phone: String(body.phone ?? ""),
      email: String(body.email ?? member.email ?? ""),
      handover,
    });
    return NextResponse.json({ success: true, listing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invio non riuscito.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
