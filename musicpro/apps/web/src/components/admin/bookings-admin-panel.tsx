"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  type AdminBookingFilter,
  type AdminBookingListItem,
  bookingPaymentMethodLabel,
  bookingStatusLabel,
  countPendingApprovalBookings,
  formatBookingDateTime,
  formatCreditsCount,
  formatEuro,
  listAdminBookings,
  reviewBooking,
} from "@musicpro/database";

import { requestBookingConfirmationEmail } from "@/lib/booking/send-confirmation-email";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";
import { createClient } from "@/lib/supabase/client";

const FILTERS: { id: AdminBookingFilter; label: string }[] = [
  { id: "pending_approval", label: "Da approvare" },
  { id: "upcoming", label: "Prossime" },
  { id: "all", label: "Tutte" },
];

function BookingPaymentDetails({ booking }: { booking: AdminBookingListItem }) {
  const paymentLabel = bookingPaymentMethodLabel(booking.payment_method);
  const showCredits =
    booking.payment_method === "credits" ||
    booking.credits_held > 0 ||
    (booking.credits_used != null && booking.credits_used > 0);

  if (!paymentLabel && !showCredits) return null;

  return (
    <div className="mt-2 space-y-1 text-sm text-neutral-600">
      {paymentLabel && (
        <p>
          Metodo pagamento:{" "}
          <span className="font-medium text-neutral-800">{paymentLabel}</span>
        </p>
      )}
      {booking.payment_method === "credits" && (
        <p className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800">
          Pagamento con crediti
        </p>
      )}
      {booking.credits_held > 0 && (
        <p>Crediti riservati: {formatCreditsCount(booking.credits_held)}</p>
      )}
      {booking.credits_used != null && booking.credits_used > 0 && (
        <p>Crediti addebitati: {formatCreditsCount(booking.credits_used)}</p>
      )}
    </div>
  );
}

export function BookingsAdminPanel() {
  const supabase = createClient();

  const [filter, setFilter] = useState<AdminBookingFilter>("pending_approval");
  const [bookings, setBookings] = useState<AdminBookingListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [list, pending] = await Promise.all([
        listAdminBookings(supabase, filter),
        countPendingApprovalBookings(supabase),
      ]);
      setBookings(list);
      setPendingCount(pending);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento prenotazioni",
      );
    } finally {
      setLoading(false);
    }
  }, [filter, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleReview(
    booking: AdminBookingListItem,
    action: "approve" | "reject",
  ) {
    if (action === "reject") {
      const ok = window.confirm(
        "Rifiutare questa prenotazione? L'associato la vedrà come annullata.",
      );
      if (!ok) return;
    }

    const heldCredits = booking.credits_held ?? 0;

    setActingId(booking.id);
    setMessage(null);
    setError(null);

    const result = await reviewBooking(
      supabase,
      booking.id,
      action,
      rejectNotes[booking.id],
    );

    setActingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Operazione non riuscita.");
      return;
    }

    if (action === "approve") {
      if (result.status === "confirmed") {
        void requestBookingCalendarSync(booking.id);
        void requestBookingConfirmationEmail(booking.id, { template: "confirm" });
        setMessage(
          booking.payment_method === "credits"
            ? "Prenotazione approvata e confermata. Crediti addebitati."
            : "Prenotazione approvata e confermata.",
        );
      } else {
        setMessage(
          "Prenotazione approvata. L'associato può completare il pagamento da «Le mie prenotazioni».",
        );
      }
    } else {
      setMessage(
        heldCredits > 0
          ? `Prenotazione rifiutata. ${formatCreditsCount(heldCredits)} rilasciati sul saldo dell'associato.`
          : "Prenotazione rifiutata.",
      );
    }

    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              filter === item.id
                ? "bg-[var(--brand)] text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {item.label}
            {item.id === "pending_approval" && pendingCount > 0
              ? ` (${pendingCount})`
              : ""}
          </button>
        ))}
      </div>

      {filter === "pending_approval" && (
        <p className="text-sm text-neutral-600">
          Prenotazioni nella fascia 6–12 ore prima dell&apos;inizio. Approva per
          confermare o rifiuta per annullare.
        </p>
      )}

      {loading && (
        <p className="text-sm text-neutral-500">Caricamento…</p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </p>
      )}

      {!loading && bookings.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-600">
          {filter === "pending_approval"
            ? "Nessuna prenotazione in attesa di approvazione."
            : "Nessuna prenotazione in questo elenco."}
        </p>
      )}

      <ul className="space-y-4">
        {bookings.map((booking) => {
          const memberName = booking.member
            ? `${booking.member.first_name} ${booking.member.last_name}`.trim()
            : "Associato";
          const isPendingApproval = booking.status === "pending_approval";

          return (
            <li
              key={booking.id}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <Link
                href={`/admin/prenotazioni/${booking.id}`}
                className="block hover:opacity-95"
              >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-[var(--brand)]">
                    {booking.room?.name ?? "Sala"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-800">
                    {formatBookingDateTime(booking.start_at, booking.end_at)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">{memberName}</p>
                  {booking.member?.email && (
                    <p className="text-xs text-neutral-500">
                      {booking.member.email}
                    </p>
                  )}
                  {booking.total_price_eur != null && (
                    <p className="mt-2 text-sm font-medium">
                      {formatEuro(booking.total_price_eur)}
                    </p>
                  )}
                  <BookingPaymentDetails booking={booking} />
                  <p className="mt-2 text-xs font-medium text-[var(--brand)]">
                    Apri dettaglio →
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isPendingApproval
                      ? "bg-amber-100 text-amber-900"
                      : booking.status === "confirmed"
                        ? "bg-green-100 text-green-800"
                        : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {bookingStatusLabel(booking.status, booking.payment_status)}
                </span>
              </div>
              </Link>

              {isPendingApproval && filter === "pending_approval" && (
                <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
                  <label className="block text-xs font-medium text-neutral-600">
                    Nota interna (opzionale, visibile in anagrafica prenotazione)
                    <input
                      type="text"
                      value={rejectNotes[booking.id] ?? ""}
                      onChange={(e) =>
                        setRejectNotes((prev) => ({
                          ...prev,
                          [booking.id]: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      placeholder="Motivo rifiuto o nota approvazione"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actingId === booking.id}
                      onClick={() => void handleReview(booking, "approve")}
                      className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
                    >
                      {actingId === booking.id ? "…" : "Approva"}
                    </button>
                    <button
                      type="button"
                      disabled={actingId === booking.id}
                      onClick={() => void handleReview(booking, "reject")}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Rifiuta
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
