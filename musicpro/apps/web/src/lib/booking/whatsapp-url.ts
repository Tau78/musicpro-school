import { formatBookingDateTime } from "@musicpro/database";

/** Normalizza un telefono IT per wa.me (solo cifre, prefisso 39). */
export function normalizeItPhoneForWa(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("39") && digits.length >= 10) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    return `39${digits.slice(1)}`;
  }
  if (digits.startsWith("3") && digits.length >= 9 && digits.length <= 11) {
    return `39${digits}`;
  }
  if (digits.length >= 10) {
    return digits;
  }
  return null;
}

type BookingWhatsAppInput = {
  start_at: string;
  end_at: string;
  status: string;
  room?: { name: string } | null;
  member?: { first_name: string } | null;
};

export function buildBookingWhatsAppMessage(booking: BookingWhatsAppInput): string {
  const firstName = booking.member?.first_name?.trim() || "";
  const greeting = firstName ? `Ciao ${firstName}` : "Ciao";
  const room = booking.room?.name ?? "sala";
  const when = formatBookingDateTime(booking.start_at, booking.end_at);

  if (booking.status === "pending_approval") {
    return `${greeting}, la tua prenotazione della sala ${room} per ${when} è in attesa di approvazione dalla segreteria. Ti aggiorneremo al più presto. MusicPro School`;
  }

  if (booking.status === "pending") {
    return `${greeting}, ti ricordiamo la prenotazione della sala ${room} per ${when}. Puoi completare il pagamento da «Le mie prenotazioni». MusicPro School`;
  }

  return `${greeting}, ti ricordiamo la prenotazione della sala ${room} per ${when}. A presto! MusicPro School`;
}

export function buildBookingWhatsAppHref(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone?.trim()) return null;
  const digits = normalizeItPhoneForWa(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
