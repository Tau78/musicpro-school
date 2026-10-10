import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";
import { mapUserFacingError } from "@musicpro/shared";

import {
  createNexiRoomBookingPaymentLink,
  eurosToCents,
} from "@/lib/nexi/room-payment-link";

type ServiceClient = SupabaseClient<Database>;

export interface RoomPaymentSessionResult {
  success: boolean;
  url?: string;
  message?: string;
  amountCents?: number;
}

function remainingChargeEur(booking: {
  total_price_eur: number | null;
  credits_held?: number | null;
  credits_used?: number | null;
}): number {
  const total = Number(booking.total_price_eur ?? 0);
  const applied =
    Number(booking.credits_held ?? 0) + Number(booking.credits_used ?? 0);
  const remaining = Math.round((total - applied) * 100) / 100;
  return remaining > 0 ? remaining : 0;
}

export async function createNexiRoomBookingPaymentSession(
  service: ServiceClient,
  bookingId: string,
  memberId: string,
  returnBaseUrl: string,
): Promise<RoomPaymentSessionResult> {
  const { data: booking, error } = await service
    .from("bookings")
    .select(
      "id, member_id, room_id, status, payment_status, total_price_eur, payment_link_url, credits_held, credits_used",
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

  const chargeEur = remainingChargeEur(booking);
  if (!Number.isFinite(chargeEur) || chargeEur <= 0) {
    return {
      success: false,
      message:
        "Nessun importo residuo da pagare con carta (eventuali crediti coprono già tutto).",
    };
  }

  const amountCents = eurosToCents(chargeEur);

  // Riusa il link solo se non ci sono crediti applicati (importo pieno invariato).
  const creditsApplied =
    Number(booking.credits_held ?? 0) + Number(booking.credits_used ?? 0);
  if (
    creditsApplied <= 0 &&
    booking.payment_link_url &&
    booking.payment_status === "link_sent"
  ) {
    return {
      success: true,
      url: booking.payment_link_url,
      amountCents,
    };
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

  const roomLabel = room?.name ?? "Sala prova";
  const description =
    creditsApplied > 0
      ? `Prenotazione ${roomLabel} (residuo dopo crediti)`
      : `Prenotazione ${roomLabel}`;

  const linkRes = await createNexiRoomBookingPaymentLink({
    bookingId,
    roomName: description,
    importoCentesimi: amountCents,
    memberName,
    returnBaseUrl,
    idempotencyKey: `room-booking-${bookingId}-${amountCents}`,
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

  return { success: true, url: linkRes.url, amountCents };
}
