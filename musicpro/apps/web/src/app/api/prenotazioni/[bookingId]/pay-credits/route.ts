import { NextRequest, NextResponse } from "next/server";

import {
  creditsForBookingPrice,
  debitBookingCredits,
  holdBookingCredits,
  holdBookingCreditsTowardPayment,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PayCreditsBody {
  mode?: "full" | "partial";
}

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

    let body: PayCreditsBody = {};
    try {
      body = (await request.json()) as PayCreditsBody;
    } catch {
      body = {};
    }
    const mode = body.mode === "partial" ? "partial" : "full";

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
      .select("id, member_id, status, total_price_eur")
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

    const credits = creditsForBookingPrice(
      Number(booking.total_price_eur ?? 0),
    );

    if (credits <= 0) {
      return NextResponse.json(
        { success: false, message: "Numero crediti non valido." },
        { status: 400 },
      );
    }

    if (mode === "partial") {
      if (
        booking.status !== "pending" &&
        booking.status !== "pending_approval"
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Pagamento misto non disponibile per questo stato.",
          },
          { status: 400 },
        );
      }

      const result = await holdBookingCreditsTowardPayment(supabase, bookingId);
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            message:
              result.errorMessage ??
              "Impossibile riservare i crediti per il pagamento misto.",
            errorCode: result.errorCode,
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        action: "hold",
        mode: "partial",
        status: result.status ?? booking.status,
        paymentStatus: result.paymentStatus,
        creditsHeld: result.creditsHeld,
        creditsUsed: result.creditsUsed,
        remainingEur: result.remainingEur,
        duplicate: result.duplicate ?? false,
      });
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
      mode: "full",
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
