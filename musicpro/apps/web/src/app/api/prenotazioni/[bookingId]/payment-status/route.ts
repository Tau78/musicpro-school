import { NextResponse } from "next/server";

import { getCurrentMember } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { bookingId } = await context.params;
  const id = bookingId?.trim();
  if (!id) {
    return NextResponse.json({ success: false, message: "Prenotazione non valida." }, { status: 400 });
  }

  const supabase = await createClient();
  const member = await getCurrentMember(supabase);
  if (!member) {
    return NextResponse.json({ success: false, message: "Accesso richiesto." }, { status: 401 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, payment_status, member_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Errore lettura prenotazione." },
      { status: 500 },
    );
  }

  if (!booking || booking.member_id !== member.id) {
    return NextResponse.json(
      { success: false, message: "Prenotazione non trovata." },
      { status: 404 },
    );
  }

  const paymentStatus = String(booking.payment_status ?? "");
  const status = String(booking.status ?? "");
  const isPaid =
    paymentStatus === "paid" || paymentStatus === "not_required";
  const isConfirmed =
    status === "confirmed" ||
    status === "pending_approval" ||
    (status === "pending" && isPaid);

  return NextResponse.json({
    success: true,
    bookingId: booking.id,
    status,
    paymentStatus,
    isPaid,
    isConfirmed,
  });
}
