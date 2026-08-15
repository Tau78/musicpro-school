import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { bookingId } = await context.params;

  if (!bookingId) {
    return NextResponse.json({ success: false, message: "ID mancante" }, { status: 400 });
  }

  let action: "upsert" | "delete" = "upsert";
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action === "delete") action = "delete";
  } catch {
    // default upsert
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, message: "Non autenticato" }, { status: 401 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, member_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return NextResponse.json(
      { success: false, message: "Prenotazione non trovata" },
      { status: 404 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);

  const isStaff = Boolean(
    currentMember?.roles.some((r) => r === "admin" || r === "segreteria"),
  );

  const isOwner = currentMember?.id === booking.member_id;
  if (!isOwner && !isStaff) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { success: false, message: "Config Supabase mancante" },
      { status: 500 },
    );
  }

  const edgeRes = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/booking-calendar-sync`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ booking_id: bookingId, action }),
    },
  );

  const payload = (await edgeRes.json().catch(() => ({}))) as Record<string, unknown>;

  return NextResponse.json(payload, { status: edgeRes.status });
}
