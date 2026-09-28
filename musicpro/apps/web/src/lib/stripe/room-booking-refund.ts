import type { SupabaseClient } from "@supabase/supabase-js";

import type { BookingStripeRefundPlan, Database } from "@musicpro/database";

import { getStripeConfig } from "@/lib/iscrizione/stripe-config";
import { createStripeClient } from "@/lib/stripe/webhook";

type ServiceClient = SupabaseClient<Database>;

type RefundRow = {
  booking_id: string;
  payment_intent_id: string;
  stripe_refund_id: string;
  amount_cents: number;
  penalty_cents: number;
  reason: string;
};

async function insertStripeRefundReceipt(row: RefundRow): Promise<boolean> {
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

  try {
    const cfg = getStripeConfig();
    const stripe = createStripeClient(cfg.secret);

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
    });

    const row: RefundRow = {
      booking_id: bookingId,
      payment_intent_id: paymentIntentId,
      stripe_refund_id: refund.id,
      amount_cents: amountCents,
      penalty_cents: plan.penalty_cents ?? 0,
      reason: "booking_cancel",
    };

    const inserted = await insertStripeRefundReceipt(row);
    if (!inserted) {
      return {
        success: false,
        message: "Rimborso Stripe eseguito ma registrazione non riuscita.",
      };
    }

    await service
      .from("bookings")
      .update({ payment_status: "refunded" })
      .eq("id", bookingId);

    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Rimborso carta non riuscito.";
    return { success: false, message };
  }
}
