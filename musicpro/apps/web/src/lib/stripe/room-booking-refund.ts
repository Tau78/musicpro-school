import type { SupabaseClient } from "@supabase/supabase-js";

import type { BookingStripeRefundPlan, Database } from "@musicpro/database";

type ServiceClient = SupabaseClient<Database>;

type RefundRow = {
  booking_id: string;
  payment_intent_id: string;
  stripe_refund_id: string;
  amount_cents: number;
  penalty_cents: number;
  reason: string;
};

async function insertRefundReceipt(row: RefundRow): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return false;

  const restResp = await fetch(
    `${supabaseUrl}/rest/v1/stripe_room_booking_refunds`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    },
  );

  return restResp.ok;
}

/**
 * V1 Nexi: registra il rimborso in locale.
 * Il movimento carta va eseguito dal back office Nexi (Classic XPay non ha refund API nel mint).
 */
export async function executeStripeRoomBookingRefund(
  service: ServiceClient,
  plan: BookingStripeRefundPlan,
): Promise<{ success: boolean; message?: string }> {
  if (!plan.needed) {
    return { success: true };
  }

  const bookingId = plan.booking_id?.trim();
  const paymentIntentId = plan.payment_intent_id?.trim();
  const amountCents = plan.amount_cents ?? 0;

  if (!bookingId || !paymentIntentId || amountCents <= 0) {
    return { success: false, message: "Piano rimborso carta non valido." };
  }

  const row: RefundRow = {
    booking_id: bookingId,
    payment_intent_id: paymentIntentId,
    stripe_refund_id: `nexi-manual:${paymentIntentId}`.slice(0, 64),
    amount_cents: amountCents,
    penalty_cents: plan.penalty_cents ?? 0,
    reason: "booking_cancel",
  };

  const inserted = await insertRefundReceipt(row);
  if (!inserted) {
    return {
      success: false,
      message:
        "Prenotazione annullata. Registra il rimborso carta dal back office Nexi.",
    };
  }

  await service
    .from("bookings")
    .update({ payment_status: "refunded" })
    .eq("id", bookingId);

  return {
    success: true,
    message:
      "Rimborso registrato in scuola. Completa il movimento carta dal back office Nexi.",
  };
}
