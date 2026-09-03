"use client";

import { useEffect } from "react";

import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";

type BookingPaymentReturnProps = {
  bookingId?: string | null;
};

export function BookingPaymentReturnNotice({
  bookingId,
}: BookingPaymentReturnProps) {
  useEffect(() => {
    const id = bookingId?.trim();
    if (!id) return;
    void requestBookingCalendarSync(id, "upsert");
  }, [bookingId]);

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
      Pagamento ricevuto. Prenotazione confermata!
    </div>
  );
}
