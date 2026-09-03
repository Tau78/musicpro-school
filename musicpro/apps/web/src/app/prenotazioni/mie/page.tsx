"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import {
  type BookingWithRoom,
  type CancelBookingResult,
  bookingNeedsPayment,
  bookingStatusLabel,
  cancelBooking,
  canCancelBooking,
  formatBookingDateTime,
  formatCreditsCount,
  formatEuro,
  getBookingSettings,
  getCurrentMember,
  listMyBookings,
  requestRoomBookingPaymentUrl,
} from "@musicpro/database";
import { mapUserFacingError } from "@musicpro/shared";

import { createClient } from "@/lib/supabase/client";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";

export default function MiePrenotazioniPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-neutral-500">Caricamento…</p>}>
      <MiePrenotazioniContent />
    </Suspense>
  );
}

function buildCancelSuccessMessage(result: CancelBookingResult): string {
  const parts = ["Prenotazione annullata."];

  if (result.creditsPenalty != null && result.creditsPenalty > 0) {
    let penaltyMsg = `Penale applicata: ${formatCreditsCount(result.creditsPenalty)}`;
    if (result.penaltyPercent != null) {
      penaltyMsg += ` (${result.penaltyPercent}%)`;
    }
    parts.push(`${penaltyMsg}.`);
  }

  if (result.creditsRefunded != null && result.creditsRefunded > 0) {
    parts.push(
      `${formatCreditsCount(result.creditsRefunded)} rimborsati sul saldo.`,
    );
  }

  return parts.join(" ");
}

function MiePrenotazioniContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [bookings, setBookings] = useState<BookingWithRoom[]>([]);
  const [cancelSettings, setCancelSettings] = useState({
    cancelMinHours: 24,
    autoConfirmMinHours: 12,
    approvalMinHours: 6,
    modifyMinHours: 6,
    bandRequired: false,
    locked: false,
    lockedMessage: "",
  });
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!memberId) return;

    try {
      const list = await listMyBookings(supabase, memberId, tab);
      setBookings(list);
    } catch (err) {
      setError(
        mapUserFacingError(
          err instanceof Error ? err.message : "",
          "Impossibile caricare le prenotazioni.",
        ),
      );
    }
  }, [memberId, supabase, tab]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const [member, settings] = await Promise.all([
          getCurrentMember(supabase),
          getBookingSettings(supabase),
        ]);

        if (cancelled) return;

        setMemberId(member?.id ?? null);
        setCancelSettings(settings);
      } catch (err) {
        if (!cancelled) {
          setError(
            mapUserFacingError(
              err instanceof Error ? err.message : "",
              "Errore di caricamento.",
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    void loadBookings().finally(() => setLoading(false));
  }, [loadBookings, memberId]);

  useEffect(() => {
    if (searchParams.get("dopoPagamento") !== "1") return;

    const params = new URLSearchParams({ dopoPagamento: "1" });
    const bookingId = searchParams.get("bookingId")?.trim();
    if (bookingId) params.set("bookingId", bookingId);

    router.replace(`/dashboard?${params.toString()}`);
  }, [router, searchParams]);

  async function handlePay(bookingId: string) {
    setPayingId(bookingId);
    setMessage(null);
    setError(null);

    const result = await requestRoomBookingPaymentUrl(bookingId);

    if (!result.success || !result.url) {
      setPayingId(null);
      setError(
        mapUserFacingError(
          result.message ?? "",
          "Impossibile avviare il pagamento.",
        ),
      );
      return;
    }

    window.location.href = result.url;
  }

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
    setMessage(null);
    setError(null);

    const result = await cancelBooking(supabase, bookingId);

    setCancellingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Annullamento non riuscito.");
      return;
    }

    setMessage(buildCancelSuccessMessage(result));
    void requestBookingCalendarSync(bookingId, "delete");
    await loadBookings();
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              Sale prova
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Le mie prenotazioni
            </h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link
              href="/prenotazioni"
              className="text-neutral-600 underline hover:text-neutral-900"
            >
              Prenota
            </Link>
            <Link
              href="/dashboard"
              className="text-neutral-600 underline hover:text-neutral-900"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-neutral-600">
          Dopo il login vedi qui tutte le tue prenotazioni — nessuna email
          obbligatoria. Per modificare un orario, annulla (se consentito) e
          riprenota oppure contatta la segreteria.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("upcoming")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === "upcoming"
                ? "bg-[var(--brand)] text-white"
                : "bg-neutral-100 text-neutral-600"
            }`}
          >
            Future
          </button>
          <button
            type="button"
            onClick={() => setTab("past")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === "past"
                ? "bg-[var(--brand)] text-white"
                : "bg-neutral-100 text-neutral-600"
            }`}
          >
            Storico
          </button>
        </div>

        {loading && (
          <p className="mt-6 text-sm text-neutral-500">Caricamento…</p>
        )}

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {message && (
          <p className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </p>
        )}

        {!loading && !memberId && (
          <p className="mt-6 text-sm text-neutral-500">
            <Link href="/login?redirect=/prenotazioni/mie" className="font-medium text-[var(--brand)] underline-offset-2 hover:underline">
              Accedi
            </Link>{" "}
            per vedere le tue prenotazioni.
          </p>
        )}

        {!loading && memberId && bookings.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-600">
              {tab === "upcoming"
                ? "Non hai prenotazioni future."
                : "Nessuna prenotazione passata."}
            </p>
            {tab === "upcoming" && (
              <Link
                href="/prenotazioni"
                className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white"
              >
                Prenota ora
              </Link>
            )}
          </div>
        )}

        <ul className="mt-6 space-y-4">
          {bookings.map((booking) => {
            const cancellable = canCancelBooking(booking.start_at, cancelSettings);

            return (
              <li
                key={booking.id}
                className="rounded-xl border border-neutral-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--brand)]">
                      {booking.room?.name ?? "Sala"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-700">
                      {formatBookingDateTime(booking.start_at, booking.end_at)}
                    </p>
                    {booking.total_price_eur != null && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {formatEuro(booking.total_price_eur)}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                    {bookingStatusLabel(booking.status, booking.payment_status)}
                  </span>
                </div>

                {tab === "upcoming" &&
                  booking.status !== "cancelled" &&
                  bookingNeedsPayment(booking) && (
                    <div className="mt-4">
                      <button
                        type="button"
                        disabled={payingId === booking.id}
                        onClick={() => void handlePay(booking.id)}
                        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
                      >
                        {payingId === booking.id ? "Reindirizzamento…" : "Paga ora"}
                      </button>
                    </div>
                  )}

                {tab === "upcoming" &&
                  booking.status !== "cancelled" && (
                    <div className="mt-4">
                      {cancellable ? (
                        <button
                          type="button"
                          disabled={cancellingId === booking.id}
                          onClick={() => void handleCancel(booking.id)}
                          className="text-sm font-medium text-red-700 underline disabled:opacity-50"
                        >
                          {cancellingId === booking.id
                            ? "Annullamento…"
                            : "Annulla prenotazione"}
                        </button>
                      ) : (
                        <p className="text-xs text-neutral-500">
                          Annullamento non disponibile online (meno di{" "}
                          {cancelSettings.cancelMinHours} ore). Contatta la
                          segreteria.
                        </p>
                      )}
                    </div>
                  )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
