import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";
import { mapUserFacingError } from "@musicpro/shared";

import {
  createStripePaymentLinkRoomBooking,
  eurosToCents,
} from "@/lib/stripe/room-payment-link";

type ServiceClient = SupabaseClient<Database>;

export interface RoomPaymentSessionResult {
  success: boolean;
  url?: string;
  message?: string;
}

export async function createRoomBookingPaymentSession(
  service: ServiceClient,
  bookingId: string,
  memberId: string,
  returnBaseUrl: string,
): Promise<RoomPaymentSessionResult> {
  const { data: booking, error } = await service
    .from("bookings")
    .select(
      "id, member_id, room_id, status, payment_status, total_price_eur, payment_link_url",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { success: false, message: "Prenotazione non trovata." };
  }

  if (booking.member_id !== memberId) {
    return { success: false, message: "Non autorizzato." };
  }

  if (
    booking.status !== "pending" &&
    booking.status !== "pending_approval"
  ) {
    return {
      success: false,
      message: "Questa prenotazione non richiede pagamento online.",
    };
  }

  if (booking.payment_status === "paid") {
    return { success: false, message: "Pagamento già registrato." };
  }

  if (
    booking.payment_status !== "unpaid" &&
    booking.payment_status !== "link_sent"
  ) {
    return { success: false, message: "Pagamento non disponibile." };
  }

  if (booking.payment_link_url && booking.payment_status === "link_sent") {
    return { success: true, url: booking.payment_link_url };
  }

  const totalEur = Number(booking.total_price_eur ?? 0);
  if (!Number.isFinite(totalEur) || totalEur <= 0) {
    return { success: false, message: "Importo prenotazione non valido." };
  }

  const [{ data: room }, { data: member }] = await Promise.all([
    service.from("rooms").select("name").eq("id", booking.room_id).maybeSingle(),
    service
      .from("members")
      .select("first_name, last_name")
      .eq("id", booking.member_id)
      .maybeSingle(),
  ]);

  const memberName = member
    ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
    : "";

  const linkRes = await createStripePaymentLinkRoomBooking({
    bookingId,
    roomName: room?.name ?? "Sala prova",
    importoCentesimi: eurosToCents(totalEur),
    memberName,
    returnBaseUrl,
    idempotencyKey: `room-booking-${bookingId}`,
  });

  if (!linkRes.success || !linkRes.url) {
    return {
      success: false,
      message: mapUserFacingError(
        linkRes.message ?? "",
        "Impossibile avviare il pagamento.",
      ),
    };
  }

  const { error: updateError } = await service
    .from("bookings")
    .update({
      payment_status: "link_sent",
      payment_link_url: linkRes.url,
      payment_link_id: linkRes.stripeId ?? null,
    })
    .eq("id", bookingId);

  if (updateError) {
    return {
      success: false,
      message: "Link creato ma salvataggio non riuscito. Riprova.",
    };
  }

  return { success: true, url: linkRes.url };
}
