"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";

type BookingPaymentReturnProps = {
  bookingId?: string | null;
};

type PollState = "checking" | "confirmed" | "pending" | "failed";

const POLL_MS = 2000;
const MAX_ATTEMPTS = 15;

export function BookingPaymentReturnNotice({
  bookingId,
}: BookingPaymentReturnProps) {
  const [state, setState] = useState<PollState>("checking");
  const [detail, setDetail] = useState<string | null>(null);

  const pollOnce = useCallback(async (id: string): Promise<PollState> => {
    const response = await fetch(
      `/api/prenotazioni/${encodeURIComponent(id)}/payment-status`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return "pending";
    }
    const body = (await response.json()) as {
      isPaid?: boolean;
      isConfirmed?: boolean;
      paymentStatus?: string;
    };
    if (body.isPaid && body.isConfirmed) {
      return "confirmed";
    }
    if (body.paymentStatus === "unpaid" || body.paymentStatus === "link_sent") {
      return "pending";
    }
    return "pending";
  }, []);

  useEffect(() => {
    const id = bookingId?.trim();
    if (!id) {
      setState("checking");
      setDetail(
        "Se hai appena pagato con carta, apri «Le mie prenotazioni» tra qualche secondo per lo stato aggiornato.",
      );
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const bookingIdForPoll = id;

    async function run() {
      while (!cancelled && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        const next = await pollOnce(bookingIdForPoll);
        if (cancelled) return;

        if (next === "confirmed") {
          setState("confirmed");
          setDetail(
            "Pagamento registrato. Prenotazione confermata — controlla anche l’email di riepilogo.",
          );
          void requestBookingCalendarSync(bookingIdForPoll, "upsert");
          return;
        }

        setState("checking");
        setDetail(
          attempts < 3
            ? "Stiamo verificando il pagamento con Nexi…"
            : "Ancora in elaborazione. Di solito bastano pochi secondi.",
        );

        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }

      if (!cancelled) {
        setState("pending");
        setDetail(
          "Il pagamento non risulta ancora registrato. Se la carta è stata addebitata, attendi un minuto e ricarica «Le mie prenotazioni», oppure contatta la segreteria.",
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [bookingId, pollOnce]);

  const boxClass =
    state === "confirmed"
      ? "border-green-200 bg-green-50 text-green-900"
      : state === "failed"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-amber-200 bg-amber-50 text-amber-950";

  const title =
    state === "confirmed"
      ? "Prenotazione confermata"
      : state === "pending"
        ? "Pagamento in verifica"
        : "Verifica pagamento";

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${boxClass}`}
    >
      <p className="font-semibold">{title}</p>
      {detail ? <p className="mt-1 text-[13px] leading-snug opacity-95">{detail}</p> : null}
      <div className="mt-3 flex min-w-0 max-w-full flex-wrap gap-2">
        <Link
          href="/prenotazioni/mie"
          className="inline-flex rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand)]/90"
        >
          Le mie prenotazioni
        </Link>
        {state !== "confirmed" ? (
          <button
            type="button"
            className="inline-flex rounded-lg border border-current/25 bg-white/60 px-3 py-1.5 text-xs font-semibold hover:bg-white"
            onClick={() => window.location.reload()}
          >
            Ricarica pagina
          </button>
        ) : null}
      </div>
    </div>
  );
}
