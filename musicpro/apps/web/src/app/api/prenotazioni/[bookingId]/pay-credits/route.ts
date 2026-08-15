import { NextRequest, NextResponse } from "next/server";

import {
  creditsForBookingDuration,
  debitBookingCredits,
  holdBookingCredits,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  try {
    const { bookingId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Devi effettuare l'accesso." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      credits?: number;
    };

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, message: "Profilo associato non trovato." },
        { status: 403 },
      );
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, member_id, status, duration_minutes")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json(
        { success: false, message: "Prenotazione non trovata." },
        { status: 404 },
      );
    }

    if (booking.member_id !== member.id) {
      return NextResponse.json(
        { success: false, message: "Non puoi pagare questa prenotazione." },
        { status: 403 },
      );
    }

    const credits =
      body.credits ??
      creditsForBookingDuration(booking.duration_minutes ?? 60);

    if (credits <= 0) {
      return NextResponse.json(
        { success: false, message: "Numero crediti non valido." },
        { status: 400 },
      );
    }

    let result;

    if (booking.status === "pending_approval") {
      result = await holdBookingCredits(supabase, bookingId, credits);
    } else if (
      booking.status === "confirmed" ||
      booking.status === "pending"
    ) {
      result = await debitBookingCredits(supabase, bookingId, credits);
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Pagamento crediti non disponibile per questo stato.",
        },
        { status: 400 },
      );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.errorMessage ?? "Pagamento con crediti non riuscito.",
          errorCode: result.errorCode,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      status: result.status,
      paymentStatus: result.paymentStatus,
      creditsHeld: result.creditsHeld,
      creditsUsed: result.creditsUsed,
      duplicate: result.duplicate ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
