import { NextRequest, NextResponse } from "next/server";

import { cancelBooking, getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageBookings } from "@/lib/admin/roles";
import { processBookingEmail } from "@/lib/booking/process-booking-email";
import { executeNexiRoomBookingRefundRecord } from "@/lib/nexi/room-booking-refund";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { bookingId } = await context.params;

  if (!bookingId) {
    return NextResponse.json(
      { success: false, message: "ID prenotazione mancante." },
      { status: 400 },
    );
  }

  let skipPenalty = false;
  try {
    const body = (await request.json()) as { skipPenalty?: boolean };
    skipPenalty = body.skipPenalty === true;
  } catch {
    /* default */
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non autenticato." },
      { status: 401 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageBookings(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato." },
      { status: 403 },
    );
  }

  const cancelResult = await cancelBooking(supabase, bookingId, { skipPenalty });

  if (!cancelResult.success) {
    return NextResponse.json(
      {
        success: false,
        message: cancelResult.errorMessage ?? "Eliminazione non riuscita.",
      },
      { status: 400 },
    );
  }

  let stripeRefundWarning: string | null = null;
  const stripePlan = cancelResult.stripeRefund;

  if (stripePlan?.needed) {
    const service = createServiceRoleClient();
    const refundResult = await executeNexiRoomBookingRefundRecord(service, stripePlan);
    if (!refundResult.success) {
      stripeRefundWarning =
        refundResult.message ??
        "Prenotazione annullata ma rimborso carta non riuscito.";
    }
  }

  try {
    await processBookingEmail({ bookingId, template: "cancelled" });
  } catch (err) {
    console.error(
      "[admin/bookings/cancel] email",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Elimina subito l'evento su Google: altrimenti il sync «esterno» lo
  // reimporta e la prenotazione annullata resta in calendario come ghost.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (supabaseUrl && serviceKey) {
      const syncRes = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/functions/v1/booking-calendar-sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ booking_id: bookingId, action: "delete" }),
        },
      );
      if (!syncRes.ok) {
        console.error(
          "[admin/bookings/cancel] calendar-sync",
          syncRes.status,
          await syncRes.text().catch(() => ""),
        );
      }
    }
  } catch (err) {
    console.error(
      "[admin/bookings/cancel] calendar-sync",
      err instanceof Error ? err.message : String(err),
    );
  }

  return NextResponse.json({
    success: true,
    bookingId: cancelResult.bookingId,
    creditsRefunded: cancelResult.creditsRefunded ?? null,
    creditsPenalty: cancelResult.creditsPenalty ?? null,
    penaltyPercent: cancelResult.penaltyPercent ?? null,
    penaltySkipped: cancelResult.penaltySkipped ?? skipPenalty,
    stripeRefundWarning,
  });
}
