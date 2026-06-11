import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "./types/database";

export const BOOKING_TIMEZONE = "Europe/Rome";

/** Practice room opening hour (local Europe/Rome). */
export const SLOT_OPEN_HOUR = 9;
/** Practice room closing hour (last slot starts here). */
export const SLOT_CLOSE_HOUR = 22;
export const SLOT_DURATION_MINUTES = 60;

export type BookingStatus = "pending" | "confirmed" | "cancelled";

export type BookingErrorCode =
  | "NOT_AUTHENTICATED"
  | "MEMBER_MISMATCH"
  | "NOT_AUTHORIZED"
  | "QUOTA_NOT_PAID"
  | "INVALID_TIME"
  | "ROOM_NOT_FOUND"
  | "SLOT_TAKEN"
  | "UNKNOWN";

export interface Room {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capacity: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface Booking {
  id: string;
  room_id: string;
  member_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  title: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeSlot {
  startAt: string;
  endAt: string;
  label: string;
  available: boolean;
  bookingId?: string;
  status?: BookingStatus;
}

export interface RoomAvailability {
  roomId: string;
  date: string;
  timezone: string;
  slots: TimeSlot[];
}

export interface CreateBookingResult {
  success: boolean;
  bookingId?: string;
  status?: BookingStatus;
  errorCode?: BookingErrorCode;
  errorMessage?: string;
}

export interface CancelBookingResult {
  success: boolean;
  booking?: Booking;
  errorMessage?: string;
}

type BookingsClient = SupabaseClient<Database>;

interface CreateBookingSafeResponse {
  success: boolean;
  booking_id?: string;
  status?: BookingStatus;
  error_code?: BookingErrorCode;
  error_message?: string;
}

const BOOKING_ERROR_MESSAGES_IT: Record<BookingErrorCode, string> = {
  NOT_AUTHENTICATED: "Devi effettuare l'accesso per prenotare.",
  MEMBER_MISMATCH: "Puoi prenotare solo per il tuo account.",
  NOT_AUTHORIZED: "Non hai i permessi per prenotare le sale prova.",
  QUOTA_NOT_PAID:
    "Devi aver pagato la quota associativa per prenotare le sale.",
  INVALID_TIME: "L'orario di fine deve essere successivo all'inizio.",
  ROOM_NOT_FOUND: "Sala non trovata o non disponibile.",
  SLOT_TAKEN: "Questo slot è già prenotato. Scegli un altro orario.",
  UNKNOWN: "Si è verificato un errore durante la prenotazione.",
};

/** @future Stripe PaymentIntent hook for pending room bookings */
export async function initiateRoomPayment(_bookingId: string): Promise<void> {
  // Placeholder — wire to Stripe when room payments are enabled
  throw new Error("Pagamento sale non ancora implementato");
}

export async function listRooms(client: BookingsClient): Promise<Room[]> {
  const { data, error } = await client
    .from("rooms")
    .select("id, name, slug, description, capacity, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare le sale: ${error.message}`);
  }

  return (data ?? []) as Room[];
}

export async function getRoomAvailability(
  client: BookingsClient,
  roomId: string,
  date: string,
): Promise<RoomAvailability> {
  const { startUtc, endUtc } = getRomeDayBoundsUtc(date);

  const { data, error } = await client
    .from("bookings")
    .select("id, start_at, end_at, status")
    .eq("room_id", roomId)
    .gte("start_at", startUtc)
    .lt("start_at", endUtc)
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`Impossibile caricare la disponibilità: ${error.message}`);
  }

  const bookedByStart = new Map<
    string,
    { id: string; status: BookingStatus }
  >();

  for (const row of (data ?? []) as Array<{
    id: string;
    start_at: string;
    status: BookingStatus;
  }>) {
    bookedByStart.set(row.start_at, {
      id: row.id,
      status: row.status,
    });
  }

  const slots = buildSlotsForDate(date, bookedByStart);

  return {
    roomId,
    date,
    timezone: BOOKING_TIMEZONE,
    slots,
  };
}

export async function createBooking(
  client: BookingsClient,
  params: {
    roomId: string;
    memberId: string;
    startAt: string;
    endAt: string;
  },
): Promise<CreateBookingResult> {
  const { data, error } = await client.rpc("create_booking_safe", {
    p_room_id: params.roomId,
    p_member_id: params.memberId,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
  });

  if (error) {
    return mapPostgresError(error);
  }

  const result = data as CreateBookingSafeResponse | null;

  if (!result) {
    return {
      success: false,
      errorCode: "UNKNOWN",
      errorMessage: BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  if (!result.success) {
    const code = result.error_code ?? "UNKNOWN";
    return {
      success: false,
      errorCode: code,
      errorMessage:
        result.error_message ?? BOOKING_ERROR_MESSAGES_IT[code] ?? BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bookingId: result.booking_id,
    status: result.status,
  };
}

export async function cancelBooking(
  client: BookingsClient,
  bookingId: string,
): Promise<CancelBookingResult> {
  const { data, error } = await client
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .neq("status", "cancelled")
    .select()
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: `Impossibile annullare la prenotazione: ${error.message}`,
    };
  }

  return {
    success: true,
    booking: data as Booking,
  };
}

export type BookingChangePayload = RealtimePostgresChangesPayload<Booking>;

export function subscribeToBookings(
  client: BookingsClient,
  roomId: string,
  callback: (payload: BookingChangePayload) => void,
): () => void {
  const channel: RealtimeChannel = client
    .channel(`bookings:room:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `room_id=eq.${roomId}`,
      },
      callback,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

function buildSlotsForDate(
  date: string,
  bookedByStart: Map<string, { id: string; status: BookingStatus }>,
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  for (let hour = SLOT_OPEN_HOUR; hour <= SLOT_CLOSE_HOUR; hour++) {
    const startAt = romeLocalToUtcIso(date, hour, 0);
    const endAt = romeLocalToUtcIso(date, hour + 1, 0);
    const booked = bookedByStart.get(startAt);

    slots.push({
      startAt,
      endAt,
      label: formatSlotLabel(date, hour),
      available: !booked,
      bookingId: booked?.id,
      status: booked?.status,
    });
  }

  return slots;
}

/** Midnight and end-of-day bounds for a calendar date in Europe/Rome, as UTC ISO strings. */
export function getRomeDayBoundsUtc(date: string): {
  startUtc: string;
  endUtc: string;
} {
  return {
    startUtc: romeLocalToUtcIso(date, 0, 0),
    endUtc: romeLocalToUtcIso(addDays(date, 1), 0, 0),
  };
}

function romeLocalToUtcIso(date: string, hour: number, minute: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIMEZONE,
    timeZoneName: "shortOffset",
  });

  const parts = formatter.formatToParts(new Date(guess));
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";

  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offsetMinutes = 0;

  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? 0);
    offsetMinutes = sign * (hours * 60 + minutes);
  }

  const utcMs = guess - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

function formatSlotLabel(date: string, hour: number): string {
  const startAt = romeLocalToUtcIso(date, hour, 0);
  const endAt = romeLocalToUtcIso(date, hour + 1, 0);

  const timeFmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: BOOKING_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${timeFmt.format(new Date(startAt))} – ${timeFmt.format(new Date(endAt))}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function mapPostgresError(error: { code?: string; message: string }): CreateBookingResult {
  if (error.code === "23505") {
    return {
      success: false,
      errorCode: "SLOT_TAKEN",
      errorMessage: BOOKING_ERROR_MESSAGES_IT.SLOT_TAKEN,
    };
  }

  return {
    success: false,
    errorCode: "UNKNOWN",
    errorMessage: error.message || BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
  };
}

export function formatDateItalian(date: string): string {
  const noonUtc = romeLocalToUtcIso(date, 12, 0);
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: BOOKING_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(noonUtc));
}

export function todayInRome(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
