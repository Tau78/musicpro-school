import { NextResponse } from "next/server";

import { processBookingEmail } from "@/lib/booking/process-booking-email";
import { isIscrizioneInternalAuthorized } from "@/lib/iscrizione/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isIscrizioneInternalAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });
  }

  let body: {
    booking_id?: string;
    template?: string;
    force?: boolean;
    payment_url?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Body JSON non valido" }, { status: 400 });
  }

  const bookingId = body.booking_id?.trim();
  if (!bookingId) {
    return NextResponse.json({ success: false, message: "booking_id mancante" }, { status: 400 });
  }

  const template = body.template === "modified" ? "modified" : "confirm";

  try {
    const result = await processBookingEmail({
      bookingId,
      template,
      force: body.force === true,
      paymentUrl: body.payment_url?.trim() || null,
    });
    const status = result.success === false ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[internal/bookings/send-email]", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
