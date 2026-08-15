import { NextRequest, NextResponse } from "next/server";

import { createRoomBookingPaymentSession } from "@/lib/stripe/room-payment-service";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

    const origin =
      request.headers.get("origin") ||
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const returnBase = `${origin.replace(/\/$/, "")}/prenotazioni/mie`;

    const service = createServiceRoleClient();
    const result = await createRoomBookingPaymentSession(
      service,
      bookingId,
      member.id,
      returnBase,
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message ?? "Pagamento non disponibile." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
