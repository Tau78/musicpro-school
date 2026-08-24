import { NextRequest, NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageBookings } from "@/lib/admin/roles";
import { createRoomBookingPaymentSession } from "@/lib/stripe/room-payment-service";
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
      { success: false, message: "ID prenotazione mancante" },
      { status: 400 },
    );
  }

  let sendEmail = true;
  try {
    const body = (await request.json()) as { sendEmail?: boolean };
    if (body.sendEmail === false) sendEmail = false;
  } catch {
    // default sendEmail true
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non autenticato" },
      { status: 401 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageBookings(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  const service = createServiceRoleClient();
  const { data: booking, error: bookingError } = await service
    .from("bookings")
    .select("id, member_id, status, payment_status, total_price_eur")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return NextResponse.json(
      { success: false, message: "Prenotazione non trovata" },
      { status: 404 },
    );
  }

  const totalEur = Number(booking.total_price_eur ?? 0);
  if (!Number.isFinite(totalEur) || totalEur <= 0) {
    return NextResponse.json(
      { success: false, message: "Importo prenotazione non valido." },
      { status: 400 },
    );
  }

  const { error: updateError } = await service
    .from("bookings")
    .update({
      status: "pending",
      payment_status: "unpaid",
      payment_method: null,
      payment_link_url: null,
      payment_link_id: null,
    })
    .eq("id", bookingId);

  if (updateError) {
    return NextResponse.json(
      { success: false, message: "Impossibile preparare la prenotazione al pagamento." },
      { status: 500 },
    );
  }

  const origin =
    request.headers.get("origin") ||
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const returnBase = `${origin.replace(/\/$/, "")}/prenotazioni/mie`;

  const paymentResult = await createRoomBookingPaymentSession(
    service,
    bookingId,
    booking.member_id,
    returnBase,
  );

  if (!paymentResult.success || !paymentResult.url) {
    return NextResponse.json(
      {
        success: false,
        message: paymentResult.message ?? "Impossibile creare il link di pagamento.",
      },
      { status: 400 },
    );
  }

  if (!sendEmail) {
    return NextResponse.json({
      success: true,
      url: paymentResult.url,
      emailSent: false,
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        success: true,
        url: paymentResult.url,
        emailSent: false,
        message: "Link creato ma config email mancante.",
      },
    );
  }

  const edgeRes = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-booking-email`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        booking_id: bookingId,
        template: "confirm",
        force: true,
        payment_url: paymentResult.url,
      }),
    },
  );

  const emailPayload = (await edgeRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!edgeRes.ok || emailPayload.success === false) {
    return NextResponse.json({
      success: true,
      url: paymentResult.url,
      emailSent: false,
      message:
        (emailPayload.message as string | undefined) ??
        "Link creato ma invio email non riuscito.",
    });
  }

  return NextResponse.json({
    success: true,
    url: paymentResult.url,
    emailSent: emailPayload.sent === true || emailPayload.skipped === true,
  });
}
