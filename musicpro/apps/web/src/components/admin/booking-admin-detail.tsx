"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  adminUpdateBooking,
  bookingAuditActionLabel,
  bookingPaymentMethodLabel,
  bookingStatusLabel,
  calculateBookingPrice,
  durationOptionsForRoom,
  formatBookingDateTime,
  formatCreditsCount,
  formatDurationLabel,
  formatEuro,
  listBookingAuditLog,
  romeLocalInputToUtcIso,
  type AdminBookingDetail,
  type BookingAuditLogEntry,
  type Room,
  type SettlementMethod,
  utcIsoToRomeLocalInput,
} from "@musicpro/database";

import { SettlementMethodPicker } from "@/components/admin/settlement-method-picker";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";
import { requestBookingConfirmationEmail } from "@/lib/booking/send-confirmation-email";
import { createClient } from "@/lib/supabase/client";

interface BookingAdminDetailProps {
  booking: AdminBookingDetail;
  rooms: Room[];
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function auditSummary(entry: BookingAuditLogEntry): string {
  const changes = entry.changes;
  if (!changes) return bookingAuditActionLabel(entry.action);

  const parts: string[] = [];
  const priceChange = changes.total_price_eur as
    | { old?: number; new?: number }
    | undefined;
  if (priceChange?.old != null && priceChange?.new != null) {
    parts.push(
      `Prezzo ${formatEuro(priceChange.old)} → ${formatEuro(priceChange.new)}`,
    );
  }

  const roomChange = changes.room_id as { old?: string; new?: string } | undefined;
  if (roomChange?.old && roomChange?.new && roomChange.old !== roomChange.new) {
    parts.push("Cambio sala");
  }

  const startChange = changes.start_at as { old?: string; new?: string } | undefined;
  if (startChange?.old && startChange?.new && startChange.old !== startChange.new) {
    parts.push("Orario modificato");
  }

  const settlement = changes.settlement_method as string | undefined;
  if (settlement) {
    parts.push(`Saldo: ${settlement}`);
  }

  return parts.length > 0 ? parts.join(" · ") : bookingAuditActionLabel(entry.action);
}

export function BookingAdminDetail({ booking, rooms }: BookingAdminDetailProps) {
  const router = useRouter();
  const supabase = createClient();

  const initialRoom =
    rooms.find((room) => room.id === booking.room_id) ?? rooms[0] ?? null;

  const [roomId, setRoomId] = useState(booking.room_id);
  const [startLocal, setStartLocal] = useState(() =>
    utcIsoToRomeLocalInput(booking.start_at),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    booking.duration_minutes ??
      Math.round(
        (new Date(booking.end_at).getTime() -
          new Date(booking.start_at).getTime()) /
          60_000,
      ),
  );
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [settlementMethod, setSettlementMethod] =
    useState<SettlementMethod | null>(null);
  const [auditLog, setAuditLog] = useState<BookingAuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedRoom = rooms.find((room) => room.id === roomId) ?? initialRoom;
  const durationOptions = selectedRoom
    ? durationOptionsForRoom(selectedRoom)
    : [durationMinutes];

  const computedPrice = useMemo(() => {
    if (!selectedRoom) return booking.total_price_eur ?? 0;
    let price = calculateBookingPrice(selectedRoom, durationMinutes);
    if (
      booking.provi_da_solo &&
      selectedRoom.provi_da_solo_discount_eur > 0
    ) {
      price = Math.max(0, price - selectedRoom.provi_da_solo_discount_eur);
    }
    return price;
  }, [selectedRoom, durationMinutes, booking.provi_da_solo, booking.total_price_eur]);

  const priceChanged =
    Math.abs(computedPrice - (booking.total_price_eur ?? 0)) > 0.009;

  useEffect(() => {
    let cancelled = false;

    void listBookingAuditLog(supabase, booking.id)
      .then((entries) => {
        if (!cancelled) setAuditLog(entries);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare lo storico.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAudit(false);
      });

    return () => {
      cancelled = true;
    };
  }, [booking.id, supabase]);

  useEffect(() => {
    if (!priceChanged) {
      setSettlementMethod(null);
    }
  }, [priceChanged]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (priceChanged && !settlementMethod) {
      setSaving(false);
      setError("Seleziona come saldare la differenza di prezzo.");
      return;
    }

    try {
      const startAt = romeLocalInputToUtcIso(startLocal);
      const endAt = addMinutesIso(startAt, durationMinutes);

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

      setSuccess(
        sendEmail
          ? "Prenotazione aggiornata. Email di modifica inviata (se configurata)."
          : "Prenotazione aggiornata.",
      );
      const entries = await listBookingAuditLog(supabase, booking.id);
      setAuditLog(entries);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  const memberName = booking.member
    ? `${booking.member.first_name} ${booking.member.last_name}`.trim()
    : "Associato";

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Prenotazione</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--brand)]">
              {booking.room?.name ?? "Sala"}
            </h3>
            <p className="mt-2 text-sm text-neutral-800">
              {formatBookingDateTime(booking.start_at, booking.end_at)}
            </p>
            <p className="mt-1 text-sm text-neutral-600">{memberName}</p>
            {booking.member?.email && (
              <p className="text-xs text-neutral-500">{booking.member.email}</p>
            )}
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            {bookingStatusLabel(booking.status, booking.payment_status)}
          </span>
        </div>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Prezzo attuale</dt>
            <dd className="font-medium">
              {booking.total_price_eur != null
                ? formatEuro(booking.total_price_eur)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Pagamento</dt>
            <dd className="font-medium">
              {bookingPaymentMethodLabel(booking.payment_method) ?? "—"}
            </dd>
          </div>
          {booking.credits_used != null && booking.credits_used > 0 && (
            <div>
              <dt className="text-neutral-500">Crediti addebitati</dt>
              <dd className="font-medium">
                {formatCreditsCount(booking.credits_used)}
              </dd>
            </div>
          )}
          {booking.provi_da_solo && (
            <div>
              <dt className="text-neutral-500">PROVI DA SOLO</dt>
              <dd className="font-medium">Sì</dd>
            </div>
          )}
          {booking.band?.name && (
            <div>
              <dt className="text-neutral-500">Band</dt>
              <dd className="font-medium">{booking.band.name}</dd>
            </div>
          )}
          {booking.member_snapshot && booking.member_snapshot.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-neutral-500">Membri (snapshot)</dt>
              <dd className="mt-1 font-medium">
                <ul className="list-inside list-disc text-sm text-neutral-800">
                  {booking.member_snapshot.map((member) => (
                    <li key={member.member_id}>
                      {`${member.first_name} ${member.last_name}`.trim()}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-w-3xl space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Modifica prenotazione
        </h3>

        <div>
          <label htmlFor="roomId" className="block text-sm font-medium text-neutral-700">
            Sala
          </label>
          <select
            id="roomId"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="startAt"
              className="block text-sm font-medium text-neutral-700"
            >
              Inizio (ora locale Roma)
            </label>
            <input
              id="startAt"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="duration"
              className="block text-sm font-medium text-neutral-700"
            >
              Durata
            </label>
            <select
              id="duration"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
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

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-neutral-700">
            Note interne
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Note visibili in anagrafica prenotazione"
          />
        </div>

        <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3 text-sm">
          <p className="text-neutral-600">
            Nuovo totale stimato:{" "}
            <span className="font-semibold text-neutral-900">
              {formatEuro(computedPrice)}
            </span>
          </p>
        </div>

        {priceChanged && (
          <SettlementMethodPicker
            value={settlementMethod}
            onChange={setSettlementMethod}
            originalPaymentMethod={booking.payment_method}
          />
        )}

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="rounded border-neutral-300"
          />
          Invia email di modifica all&apos;associato
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {success && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : "Salva modifiche"}
          </button>
          <Link
            href="/admin/prenotazioni"
            className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Torna all&apos;elenco
          </Link>
        </div>
      </form>

      <section className="max-w-3xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Storico modifiche
        </h3>

        {loadingAudit && (
          <p className="mt-4 text-sm text-neutral-500">Caricamento storico…</p>
        )}

        {!loadingAudit && auditLog.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500">
            Nessuna voce nello storico.
          </p>
        )}

        {!loadingAudit && auditLog.length > 0 && (
          <ol className="mt-4 space-y-4 border-l-2 border-neutral-200 pl-4">
            {auditLog.map((entry) => {
              const actorName = entry.actor
                ? `${entry.actor.first_name} ${entry.actor.last_name}`.trim()
                : "Sistema";
              const when = new Date(entry.createdAt).toLocaleString("it-IT", {
                timeZone: "Europe/Rome",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <li key={entry.id} className="relative">
                  <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
                  <p className="text-sm font-medium text-neutral-900">
                    {bookingAuditActionLabel(entry.action)}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {when} · {actorName}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {auditSummary(entry)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
