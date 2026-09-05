import { NextRequest, NextResponse } from "next/server";

import { cancelBooking, getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageBookings } from "@/lib/admin/roles";
import { executeStripeRoomBookingRefund } from "@/lib/stripe/room-booking-refund";
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
    const refundResult = await executeStripeRoomBookingRefund(service, stripePlan);
    if (!refundResult.success) {
      stripeRefundWarning =
        refundResult.message ??
        "Prenotazione annullata ma rimborso carta non riuscito.";
    }
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
