"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  adminUpdateBooking,
  bookingPaymentMethodLabel,
  bookingStatusLabel,
  calculateBookingPrice,
  createBooking,
  durationOptionsForRoom,
  formatDurationLabel,
  formatEuro,
  getAdminBookingById,
  listMembers,
  proviDaSoloDiscountTotalEur,
  romeLocalInputToUtcIso,
  utcIsoToRomeLocalInput,
  type AdminBookingDetail,
  type MemberSummary,
  type Room,
  type SettlementMethod,
} from "@musicpro/database";

import { SettlementMethodPicker } from "@/components/admin/settlement-method-picker";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";
import { requestBookingConfirmationEmail } from "@/lib/booking/send-confirmation-email";
import { createClient } from "@/lib/supabase/client";

export type BookingCalendarDraft = {
  roomId: string;
  startLocal: string;
  durationMinutes: number;
};

type ExternalPreview = {
  title: string;
  roomName: string | null;
  startsAt: string;
  endsAt: string;
};

interface BookingCalendarDialogProps {
  mode: "create" | "edit" | "external";
  bookingId?: string;
  draft?: BookingCalendarDraft;
  external?: ExternalPreview;
  rooms: Room[];
  onClose: () => void;
  onSaved: () => void;
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function formatWhen(startsAt: string, endsAt: string): string {
  const fmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endFmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(new Date(startsAt))} – ${endFmt.format(new Date(endsAt))}`;
}

export function BookingCalendarDialog({
  mode,
  bookingId,
  draft,
  external,
  rooms,
  onClose,
  onSaved,
}: BookingCalendarDialogProps) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(mode === "edit");
  const [booking, setBooking] = useState<AdminBookingDetail | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<MemberSummary[]>([]);
  const [memberId, setMemberId] = useState("");
  const [roomId, setRoomId] = useState(
    draft?.roomId ?? rooms[0]?.id ?? "",
  );
  const [startLocal, setStartLocal] = useState(draft?.startLocal ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    draft?.durationMinutes ?? rooms[0]?.default_duration_minutes ?? 120,
  );
  const [notes, setNotes] = useState("");
  const [settlementMethod, setSettlementMethod] =
    useState<SettlementMethod | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendConfirmEmail, setSendConfirmEmail] = useState(false);
  const [includePayment, setIncludePayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !bookingId) return;
    let cancelled = false;
    setLoading(true);
    void getAdminBookingById(supabase, bookingId)
      .then((row) => {
        if (cancelled || !row) return;
        setBooking(row);
        setRoomId(row.room_id);
        setStartLocal(utcIsoToRomeLocalInput(row.start_at));
        setDurationMinutes(
          row.duration_minutes ??
            Math.round(
              (new Date(row.end_at).getTime() -
                new Date(row.start_at).getTime()) /
                60_000,
            ),
        );
        setNotes(row.notes ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare la prenotazione.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, mode, supabase]);

  useEffect(() => {
    if (mode !== "create") return;
    const term = memberQuery.trim();
    if (term.length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void listMembers(supabase, term)
        .then(setMemberResults)
        .catch(() => setMemberResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [memberQuery, mode, supabase]);

  const selectedRoom =
    rooms.find((room) => room.id === roomId) ?? rooms[0] ?? null;
  const durationOptions = selectedRoom
    ? durationOptionsForRoom(selectedRoom)
    : [durationMinutes];

  const computedPrice = useMemo(() => {
    if (!selectedRoom) return booking?.total_price_eur ?? 0;
    let price = calculateBookingPrice(selectedRoom, durationMinutes);
    if (booking?.provi_da_solo && selectedRoom.provi_da_solo_discount_eur > 0) {
      price = Math.max(
        0,
        price -
          proviDaSoloDiscountTotalEur(
            selectedRoom.provi_da_solo_discount_eur,
            durationMinutes,
          ),
      );
    }
    return price;
  }, [booking?.provi_da_solo, booking?.total_price_eur, durationMinutes, selectedRoom]);

  const priceChanged =
    mode === "edit" &&
    booking != null &&
    Math.abs(computedPrice - (booking.total_price_eur ?? 0)) > 0.009;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const startAt = romeLocalInputToUtcIso(startLocal);
      const endAt = addMinutesIso(startAt, durationMinutes);

      if (mode === "create") {
        if (!memberId) {
          setError("Seleziona un associato.");
          return;
        }
        const result = await createBooking(supabase, {
          roomId,
          memberId,
          startAt,
          endAt,
        });
        if (!result.success) {
          setError(result.errorMessage ?? "Creazione non riuscita.");
          return;
        }
        if (!result.bookingId) {
          setError("Prenotazione creata ma ID non disponibile.");
          return;
        }

        if (includePayment) {
          const paymentResp = await fetch(
            `/api/admin/bookings/${encodeURIComponent(result.bookingId)}/init-payment`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sendEmail: true }),
              credentials: "same-origin",
            },
          );
          const paymentData = (await paymentResp.json()) as {
            success?: boolean;
            message?: string;
            emailSent?: boolean;
          };
          if (!paymentResp.ok || paymentData.success === false) {
            setError(
              paymentData.message ??
                "Prenotazione creata ma preparazione pagamento non riuscita.",
            );
            return;
          }
        } else if (sendConfirmEmail) {
          if (result.status === "confirmed") {
            void requestBookingCalendarSync(result.bookingId);
          }
          void requestBookingConfirmationEmail(result.bookingId, {
            template: "confirm",
          });
        }
        onSaved();
        onClose();
        return;
      }

      if (!booking) return;

      if (priceChanged && !settlementMethod) {
        setError("Seleziona come saldare la differenza di prezzo.");
        return;
      }

      const result = await adminUpdateBooking(supabase, booking.id, {
        roomId,
        startAt,
        endAt,
        notes,
        settlementMethod: priceChanged ? settlementMethod ?? undefined : undefined,
      });

      if (!result.success) {
        setError(result.errorMessage ?? "Salvataggio non riuscito.");
        return;
      }

      if (booking.status === "confirmed") {
        void requestBookingCalendarSync(booking.id);
      }
      if (sendEmail) {
        void requestBookingConfirmationEmail(booking.id, {
          template: "modified",
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "create"
      ? "Nuova prenotazione"
      : mode === "external"
        ? "Evento calendario esterno"
        : "Prenotazione";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[var(--brand)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Chiudi
          </button>
        </div>

        {mode === "external" && external ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-medium text-neutral-900">{external.title}</p>
            <p className="text-neutral-600">
              {formatWhen(external.startsAt, external.endsAt)}
            </p>
            {external.roomName ? (
              <p className="text-neutral-600">Sala: {external.roomName}</p>
            ) : null}
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-600">
              Evento importato da calendario esterno: non modificabile da qui.
            </p>
          </div>
        ) : loading ? (
          <p className="mt-4 text-sm text-neutral-500">Caricamento…</p>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="mt-4 space-y-4">
            {mode === "edit" && booking ? (
              <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
                <p className="font-medium text-neutral-900">
                  {booking.member
                    ? `${booking.member.first_name} ${booking.member.last_name}`.trim()
                    : "Associato"}
                </p>
                <p className="mt-1 text-neutral-600">
                  {bookingStatusLabel(booking.status, booking.payment_status)}
                  {booking.payment_method
                    ? ` · ${bookingPaymentMethodLabel(booking.payment_method)}`
                    : ""}
                </p>
              </div>
            ) : null}

            {mode === "create" ? (
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Associato
                </label>
                <input
                  type="search"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Cerca per nome…"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                {memberResults.length > 0 ? (
                  <ul className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-neutral-200">
                    {memberResults.map((member) => {
                      const label =
                        `${member.lastName} ${member.firstName}`.trim();
                      const selected = member.id === memberId;
                      return (
                        <li key={member.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setMemberId(member.id);
                              setMemberQuery(label);
                              setMemberResults([]);
                            }}
                            className={`block w-full px-3 py-2 text-left text-sm ${
                              selected
                                ? "bg-[var(--brand)]/10 font-medium text-[var(--brand)]"
                                : "hover:bg-neutral-50"
                            }`}
                          >
                            {label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Sala
              </label>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Inizio
                </label>
                <input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Durata
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) =>
                    setDurationMinutes(Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  {durationOptions.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatDurationLabel(minutes)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {mode === "edit" ? (
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Note interne
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            ) : null}

            <p className="text-sm text-neutral-600">
              Totale stimato:{" "}
              <span className="font-semibold text-neutral-900">
                {formatEuro(computedPrice)}
              </span>
            </p>

            {priceChanged ? (
              <SettlementMethodPicker
                value={settlementMethod}
                onChange={setSettlementMethod}
                originalPaymentMethod={booking?.payment_method ?? null}
              />
            ) : null}

            {mode === "create" ? (
              <div className="space-y-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3">
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={sendConfirmEmail}
                    disabled={includePayment}
                    onChange={(e) => setSendConfirmEmail(e.target.checked)}
                  />
                  <span>
                    Invia email di conferma
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      Email con dettagli prenotazione, come se fosse già pagata e
                      confermata.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={includePayment}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIncludePayment(checked);
                      if (checked) setSendConfirmEmail(false);
                    }}
                  />
                  <span>
                    Aggiungi estremi per pagamento
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      La prenotazione resta non pagata; l&apos;email include un
                      link per pagare online.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            {mode === "edit" ? (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                Invia email di modifica
              </label>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {mode === "edit" && bookingId ? (
                <Link
                  href={`/admin/prenotazioni/${bookingId}`}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                >
                  Pagina completa
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : mode === "create" ? "Crea" : "Salva"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
