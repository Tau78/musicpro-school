import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { processBookingEmail } from "@/lib/booking/process-booking-email";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { bookingId } = await context.params;

  if (!bookingId) {
    return NextResponse.json({ success: false, message: "ID mancante" }, { status: 400 });
  }

  let template: "confirm" | "modified" = "confirm";
  let force = false;
  let paymentUrl: string | undefined;

  try {
    const body = (await request.json()) as {
      template?: string;
      force?: boolean;
      payment_url?: string;
    };
    if (body.template === "modified") template = "modified";
    if (body.force === true) force = true;
    if (body.payment_url?.trim()) paymentUrl = body.payment_url.trim();
  } catch {
    // defaults
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

  try {
    const result = await processBookingEmail({
      bookingId,
      template,
      force,
      paymentUrl,
    });
    const status = result.success === false ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bookings/send-email]", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
