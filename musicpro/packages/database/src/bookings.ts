import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "./types/database";

export const BOOKING_TIMEZONE = "Europe/Rome";

/** @deprecated Use room.openHour from DB */
export const SLOT_OPEN_HOUR = 9;
/** @deprecated Use room.closeHour from DB */
export const SLOT_CLOSE_HOUR = 22;
/** @deprecated Use room.defaultDurationMinutes from DB */
export const SLOT_DURATION_MINUTES = 60;

export type BookingStatus =
  | "pending"
  | "pending_approval"
  | "confirmed"
  | "cancelled";

export type BookingPaymentStatus =
  | "unpaid"
  | "link_sent"
  | "paid"
  | "not_required";

export type BookingPaymentMethod = "stripe" | "credits";

export type BookingErrorCode =
  | "NOT_AUTHENTICATED"
  | "MEMBER_MISMATCH"
  | "NOT_AUTHORIZED"
  | "QUOTA_NOT_PAID"
  | "INVALID_TIME"
  | "INVALID_DURATION"
  | "ROOM_NOT_FOUND"
  | "SLOT_TAKEN"
  | "TOO_LATE"
  | "NOT_FOUND"
  | "ALREADY_CANCELLED"
  | "CANCEL_TOO_LATE"
  | "INVALID_ACTION"
  | "INVALID_STATUS"
  | "UNKNOWN";

export interface Room {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capacity: number | null;
  is_active: boolean;
  sort_order: number;
  hourly_rate_eur: number;
  slot_granularity_minutes: number;
  default_duration_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  open_hour: number;
  close_hour: number;
  google_calendar_color_id?: string | null;
  provi_da_solo_enabled: boolean;
  provi_da_solo_discount_eur: number;
}

export interface ProviScheduleEntry {
  roomId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
}

export interface BookingSettings {
  autoConfirmMinHours: number;
  approvalMinHours: number;
  cancelMinHours: number;
  modifyMinHours: number;
}

export interface Booking {
  id: string;
  room_id: string;
  member_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  total_price_eur: number | null;
  duration_minutes: number | null;
  payment_status: BookingPaymentStatus;
  payment_link_url: string | null;
  payment_link_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  title: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  payment_method: BookingPaymentMethod | null;
  credits_held: number;
  credits_used: number | null;
  provi_da_solo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingWithRoom extends Booking {
  room?: Pick<Room, "id" | "name" | "slug"> | null;
}

export interface AdminBookingListItem extends BookingWithRoom {
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}

export interface TimeSlot {
  startAt: string;
  endAt: string;
  label: string;
  available: boolean;
  bookingId?: string;
  status?: BookingStatus;
  priceEur?: number;
  leadTimeCategory?: LeadTimeCategory;
}

export type LeadTimeCategory = "auto" | "approval" | "too_late";

export interface BusyInterval {
  start_at: string;
  end_at: string;
  source?: "booking" | "calendar";
  id?: string;
}

export interface RoomAvailability {
  roomId: string;
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: TimeSlot[];
}

export interface CreateBookingResult {
  success: boolean;
  bookingId?: string;
  status?: BookingStatus;
  totalPriceEur?: number;
  durationMinutes?: number;
  requiresApproval?: boolean;
  requiresPayment?: boolean;
  errorCode?: BookingErrorCode;
  errorMessage?: string;
}

export interface CancelBookingResult {
  success: boolean;
  bookingId?: string;
  errorCode?: BookingErrorCode;
  errorMessage?: string;
  /** Crediti trattenuti come penale (annullamento tardivo). */
  creditsPenalty?: number;
  /** Percentuale penale applicata, se disponibile. */
  penaltyPercent?: number;
  /** Crediti restituiti sul saldo dopo la penale. */
  creditsRefunded?: number;
  penaltyApplied?: boolean;
}

export interface ReviewBookingResult {
  success: boolean;
  bookingId?: string;
  status?: BookingStatus;
  action?: "approve" | "reject";
  errorCode?: BookingErrorCode;
  errorMessage?: string;
}

export type AdminBookingFilter =
  | "pending_approval"
  | "upcoming"
  | "all";

type BookingsClient = SupabaseClient<Database>;

interface CreateBookingSafeResponse {
  success: boolean;
  booking_id?: string;
  status?: BookingStatus;
  total_price_eur?: number;
  duration_minutes?: number;
  requires_approval?: boolean;
  requires_payment?: boolean;
  error_code?: BookingErrorCode;
  error_message?: string;
}

interface CancelBookingSafeResponse {
  success: boolean;
  booking_id?: string;
  error_code?: BookingErrorCode;
  error_message?: string;
  credits_penalty?: number;
  penalty_percent?: number;
  credits_refunded?: number;
  penalty_applied?: boolean;
}

interface ReviewBookingSafeResponse {
  success: boolean;
  booking_id?: string;
  status?: BookingStatus;
  action?: string;
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
  INVALID_DURATION: "Durata non valida per questa sala.",
  ROOM_NOT_FOUND: "Sala non trovata o non disponibile.",
  SLOT_TAKEN: "Questo slot è già prenotato. Scegli un altro orario.",
  TOO_LATE: "Anticipo insufficiente per prenotare in questo orario.",
  NOT_FOUND: "Prenotazione non trovata.",
  ALREADY_CANCELLED: "Prenotazione già annullata.",
  CANCEL_TOO_LATE:
    "Annullamento non consentito: contatta la segreteria.",
  INVALID_ACTION: "Azione non valida.",
  INVALID_STATUS: "Stato prenotazione non valido per questa operazione.",
  UNKNOWN: "Si è verificato un errore durante la prenotazione.",
};

const ROOM_SELECT =
  "id, name, slug, description, capacity, is_active, sort_order, hourly_rate_eur, slot_granularity_minutes, default_duration_minutes, min_duration_minutes, max_duration_minutes, open_hour, close_hour, google_calendar_color_id, provi_da_solo_enabled, provi_da_solo_discount_eur";

const BOOKING_SELECT =
  "id, room_id, member_id, start_at, end_at, status, total_price_eur, duration_minutes, payment_status, payment_method, credits_held, credits_used, provi_da_solo, payment_link_url, payment_link_id, stripe_payment_intent_id, paid_at, title, notes, cancelled_at, cancelled_by, created_at, updated_at";

export function bookingNeedsPayment(booking: Pick<Booking, "status" | "payment_status">): boolean {
  return (
    booking.status === "pending" &&
    (booking.payment_status === "unpaid" || booking.payment_status === "link_sent")
  );
}

/** Richiede POST /api/prenotazioni/{id}/pay-credits (solo web). */
export async function requestBookingCreditsPayment(
  bookingId: string,
  credits: number,
): Promise<{
  success: boolean;
  action?: "hold" | "debit";
  status?: string;
  message?: string;
  errorCode?: string;
}> {
  const resp = await fetch(
    `/api/prenotazioni/${encodeURIComponent(bookingId)}/pay-credits`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits }),
    },
  );

  const data = (await resp.json()) as {
    success?: boolean;
    action?: "hold" | "debit";
    status?: string;
    message?: string;
    errorCode?: string;
  };

  if (!resp.ok || !data.success) {
    return {
      success: false,
      message: data.message ?? "Impossibile pagare con crediti.",
      errorCode: data.errorCode,
    };
  }

  return { success: true, action: data.action, status: data.status };
}

/** Richiede POST /api/prenotazioni/{id}/payment (solo web). */
export async function requestRoomBookingPaymentUrl(
  bookingId: string,
): Promise<{ success: boolean; url?: string; message?: string }> {
  const resp = await fetch(`/api/prenotazioni/${encodeURIComponent(bookingId)}/payment`, {
    method: "POST",
  });

  const data = (await resp.json()) as {
    success?: boolean;
    url?: string;
    message?: string;
  };

  if (!resp.ok || !data.success || !data.url) {
    return {
      success: false,
      message: data.message ?? "Impossibile avviare il pagamento.",
    };
  }

  return { success: true, url: data.url };
}

export interface BookingPriceOptions {
  /** Sconto cumulativo da fasce durata (€) */
  durationDiscountEur?: number;
  /** Sconto PROVI DA SOLO (€) */
  proviDaSoloDiscountEur?: number;
  /** Somma addon selezionati (€) */
  addonTotalEur?: number;
}

/**
 * Prezzo prenotazione sala.
 *
 * Formula ufficiale:
 * `totale = tariffa × ore − sconti durata − sconto PROVI DA SOLO + addon`
 *
 * Fase 1: solo base (tariffa × ore). Opzioni per sconti/addon in Fase 2.
 */
export function calculateBookingPrice(
  room: Pick<Room, "hourly_rate_eur">,
  durationMinutes: number,
  options: BookingPriceOptions = {},
): number {
  const base = room.hourly_rate_eur * (durationMinutes / 60);
  const total =
    base -
    (options.durationDiscountEur ?? 0) -
    (options.proviDaSoloDiscountEur ?? 0) +
    (options.addonTotalEur ?? 0);

  return Math.round(Math.max(0, total) * 100) / 100;
}

export function durationOptionsForRoom(room: Room): number[] {
  const options: number[] = [];
  const step = 60;

  for (
    let minutes = room.min_duration_minutes;
    minutes <= room.max_duration_minutes;
    minutes += step
  ) {
    options.push(minutes);
  }

  if (!options.includes(room.default_duration_minutes)) {
    options.push(room.default_duration_minutes);
    options.sort((a, b) => a - b);
  }

  return options;
}

export function formatDurationLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 ora" : `${hours} ore`;
  }
  return `${minutes} min`;
}

export async function getBookingSettings(
  client: BookingsClient,
): Promise<BookingSettings> {
  const keys = [
    "booking_auto_confirm_min_hours",
    "booking_approval_min_hours",
    "booking_cancel_min_hours",
    "booking_modify_min_hours",
  ] as const;

  const { data, error } = await client
    .from("app_settings")
    .select("key, value")
    .in("key", [...keys]);

  if (error) {
    throw new Error(`Impossibile caricare impostazioni prenotazioni: ${error.message}`);
  }

  const map = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    autoConfirmMinHours: parseInt(
      map.get("booking_auto_confirm_min_hours") ?? "12",
      10,
    ),
    approvalMinHours: parseInt(
      map.get("booking_approval_min_hours") ?? "6",
      10,
    ),
    cancelMinHours: parseInt(
      map.get("booking_cancel_min_hours") ?? "24",
      10,
    ),
    modifyMinHours: parseInt(
      map.get("booking_modify_min_hours") ?? "6",
      10,
    ),
  };
}

export function getLeadTimeCategory(
  startAt: string,
  settings: BookingSettings,
): LeadTimeCategory {
  const leadHours = (new Date(startAt).getTime() - Date.now()) / 3_600_000;

  if (leadHours < settings.approvalMinHours) return "too_late";
  if (leadHours < settings.autoConfirmMinHours) return "approval";
  return "auto";
}

export function canCancelBooking(
  startAt: string,
  settings: BookingSettings,
): boolean {
  const leadHours = (new Date(startAt).getTime() - Date.now()) / 3_600_000;
  return leadHours >= settings.cancelMinHours;
}

const DAY_NAMES_IT = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
] as const;

export function proviDayLabel(dayOfWeek: number): string {
  return DAY_NAMES_IT[dayOfWeek] ?? `Giorno ${dayOfWeek}`;
}

export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeLabelToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function getRomeDayOfWeek(iso: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIMEZONE,
    weekday: "short",
  });
  const weekday = formatter.format(new Date(iso));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function getRomeMinutesFromMidnight(iso: string): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isSlotInProviSchedule(
  startAt: string,
  endAt: string,
  schedule: ProviScheduleEntry[],
): boolean {
  const dayOfWeek = getRomeDayOfWeek(startAt);
  const startMinute = getRomeMinutesFromMidnight(startAt);
  const endMinute = getRomeMinutesFromMidnight(endAt);

  return schedule.some(
    (entry) =>
      entry.enabled &&
      entry.dayOfWeek === dayOfWeek &&
      startMinute >= entry.startMinute &&
      endMinute <= entry.endMinute,
  );
}

export async function listRooms(client: BookingsClient): Promise<Room[]> {
  const { data, error } = await client
    .from("rooms")
    .select(ROOM_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare le sale: ${error.message}`);
  }

  return (data ?? []) as Room[];
}

export async function getRoomById(
  client: BookingsClient,
  roomId: string,
): Promise<Room | null> {
  const { data, error } = await client
    .from("rooms")
    .select(ROOM_SELECT)
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare la sala: ${error.message}`);
  }

  return (data as Room | null) ?? null;
}

export async function getRoomAvailability(
  client: BookingsClient,
  roomId: string,
  date: string,
  durationMinutes?: number,
): Promise<RoomAvailability> {
  const room = await getRoomById(client, roomId);
  if (!room) {
    throw new Error("Sala non trovata.");
  }

  const duration = durationMinutes ?? room.default_duration_minutes;
  const settings = await getBookingSettings(client);
  const { startUtc, endUtc } = getRomeDayBoundsUtc(date);

  const { data, error } = await client
    .from("bookings")
    .select("id, start_at, end_at, status")
    .eq("room_id", roomId)
    .lt("start_at", endUtc)
    .gt("end_at", startUtc)
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`Impossibile caricare la disponibilità: ${error.message}`);
  }

  const activeBookings = (data ?? []) as Array<{
    id: string;
    start_at: string;
    end_at: string;
    status: BookingStatus;
  }>;

  const slots = buildSlotsForRoom(date, room, duration, activeBookings, settings);

  return {
    roomId,
    date,
    timezone: BOOKING_TIMEZONE,
    durationMinutes: duration,
    slots,
  };
}

/** Disponibilità con merge prenotazioni DB + eventi Google Calendar (via API web). */
export async function fetchRoomAvailability(
  roomId: string,
  date: string,
  durationMinutes?: number,
): Promise<RoomAvailability> {
  const params = new URLSearchParams({ roomId, date });
  if (durationMinutes != null) {
    params.set("duration", String(durationMinutes));
  }

  const resp = await fetch(`/api/prenotazioni/availability?${params.toString()}`, {
    credentials: "same-origin",
  });

  const payload = (await resp.json()) as RoomAvailability & {
    message?: string;
  };

  if (!resp.ok) {
    throw new Error(payload.message ?? "Impossibile caricare la disponibilità.");
  }

  return payload;
}

export function mergeBusyIntervals(
  bookings: Array<{
    id: string;
    start_at: string;
    end_at: string;
    status: BookingStatus;
  }>,
  calendarBusy: BusyInterval[],
): Array<{
  id: string;
  start_at: string;
  end_at: string;
  status?: BookingStatus;
}> {
  const merged: Array<{
    id: string;
    start_at: string;
    end_at: string;
    status?: BookingStatus;
  }> = bookings.map((booking) => ({
    id: booking.id,
    start_at: booking.start_at,
    end_at: booking.end_at,
    status: booking.status,
  }));

  for (const busy of calendarBusy) {
    const overlapsExisting = merged.some(
      (item) =>
        item.start_at < busy.end_at &&
        item.end_at > busy.start_at &&
        Math.abs(
          new Date(item.start_at).getTime() - new Date(busy.start_at).getTime(),
        ) < 60_000 &&
        Math.abs(
          new Date(item.end_at).getTime() - new Date(busy.end_at).getTime(),
        ) < 60_000,
    );
    if (overlapsExisting) continue;

    merged.push({
      id: busy.id ?? `cal-${busy.start_at}`,
      start_at: busy.start_at,
      end_at: busy.end_at,
    });
  }

  return merged;
}

export function buildRoomAvailability(
  room: Room,
  date: string,
  durationMinutes: number,
  bookings: Array<{
    id: string;
    start_at: string;
    end_at: string;
    status: BookingStatus;
  }>,
  settings: BookingSettings,
  calendarBusy: BusyInterval[] = [],
): RoomAvailability {
  const merged = mergeBusyIntervals(bookings, calendarBusy);
  const slots = buildSlotsForRoom(date, room, durationMinutes, merged, settings);

  return {
    roomId: room.id,
    date,
    timezone: BOOKING_TIMEZONE,
    durationMinutes,
    slots,
  };
}

export async function listMyBookings(
  client: BookingsClient,
  memberId: string,
  filter: "upcoming" | "past" = "upcoming",
): Promise<BookingWithRoom[]> {
  const now = new Date().toISOString();

  let query = client
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("member_id", memberId)
    .neq("status", "cancelled");

  if (filter === "upcoming") {
    query = query.gte("start_at", now).order("start_at", { ascending: true });
  } else {
    query = query.lt("start_at", now).order("start_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare le prenotazioni: ${error.message}`);
  }

  const bookings = (data ?? []) as Booking[];

  if (bookings.length === 0) {
    return [];
  }

  const roomIds = [...new Set(bookings.map((b) => b.room_id))];
  const { data: rooms, error: roomsError } = await client
    .from("rooms")
    .select("id, name, slug")
    .in("id", roomIds);

  if (roomsError) {
    throw new Error(`Impossibile caricare le sale: ${roomsError.message}`);
  }

  const roomById = new Map(
    (rooms ?? []).map((room) => [room.id, room as Pick<Room, "id" | "name" | "slug">]),
  );

  return bookings.map((booking) => ({
    ...booking,
    room: roomById.get(booking.room_id) ?? null,
  }));
}

export async function listAdminBookings(
  client: BookingsClient,
  filter: AdminBookingFilter = "pending_approval",
): Promise<AdminBookingListItem[]> {
  const now = new Date().toISOString();

  let query = client.from("bookings").select(BOOKING_SELECT);

  if (filter === "pending_approval") {
    query = query
      .eq("status", "pending_approval")
      .order("start_at", { ascending: true });
  } else if (filter === "upcoming") {
    query = query
      .gte("start_at", now)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });
  } else {
    query = query.order("start_at", { ascending: false }).limit(100);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare le prenotazioni: ${error.message}`);
  }

  const bookings = (data ?? []) as Booking[];
  if (bookings.length === 0) return [];

  const roomIds = [...new Set(bookings.map((b) => b.room_id))];
  const memberIds = [...new Set(bookings.map((b) => b.member_id))];

  const [{ data: rooms, error: roomsError }, { data: members, error: membersError }] =
    await Promise.all([
      client.from("rooms").select("id, name, slug").in("id", roomIds),
      client
        .from("members")
        .select("id, first_name, last_name, email")
        .in("id", memberIds),
    ]);

  if (roomsError) {
    throw new Error(`Impossibile caricare le sale: ${roomsError.message}`);
  }
  if (membersError) {
    throw new Error(`Impossibile caricare gli associati: ${membersError.message}`);
  }

  const roomById = new Map(
    (rooms ?? []).map((room) => [room.id, room as Pick<Room, "id" | "name" | "slug">]),
  );
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  return bookings.map((booking) => ({
    ...booking,
    room: roomById.get(booking.room_id) ?? null,
    member: memberById.get(booking.member_id) ?? null,
  }));
}

export async function countPendingApprovalBookings(
  client: BookingsClient,
): Promise<number> {
  const { count, error } = await client
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_approval");

  if (error) {
    throw new Error(`Impossibile contare le prenotazioni: ${error.message}`);
  }

  return count ?? 0;
}

export async function createBooking(
  client: BookingsClient,
  params: {
    roomId: string;
    memberId: string;
    startAt: string;
    endAt: string;
    proviDaSolo?: boolean;
  },
): Promise<CreateBookingResult> {
  const { data, error } = await client.rpc("create_booking_safe", {
    p_room_id: params.roomId,
    p_member_id: params.memberId,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
    p_provi_da_solo: params.proviDaSolo ?? false,
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
        result.error_message ??
        BOOKING_ERROR_MESSAGES_IT[code] ??
        BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bookingId: result.booking_id,
    status: result.status,
    totalPriceEur: result.total_price_eur,
    durationMinutes: result.duration_minutes,
    requiresApproval: result.requires_approval,
    requiresPayment: result.requires_payment,
  };
}

export async function cancelBooking(
  client: BookingsClient,
  bookingId: string,
): Promise<CancelBookingResult> {
  const { data, error } = await client.rpc("cancel_booking_safe", {
    p_booking_id: bookingId,
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as CancelBookingSafeResponse | null;

  if (!result?.success) {
    const code = result?.error_code ?? "UNKNOWN";
    return {
      success: false,
      errorCode: code,
      errorMessage:
        result?.error_message ??
        BOOKING_ERROR_MESSAGES_IT[code] ??
        BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bookingId: result.booking_id,
    creditsPenalty: result.credits_penalty,
    penaltyPercent: result.penalty_percent,
    creditsRefunded: result.credits_refunded,
    penaltyApplied: result.penalty_applied,
  };
}

export async function reviewBooking(
  client: BookingsClient,
  bookingId: string,
  action: "approve" | "reject",
  notes?: string,
): Promise<ReviewBookingResult> {
  const { data, error } = await client.rpc("review_booking_safe", {
    p_booking_id: bookingId,
    p_action: action,
    p_notes: notes?.trim() || null,
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as ReviewBookingSafeResponse | null;

  if (!result?.success) {
    const code = result?.error_code ?? "UNKNOWN";
    return {
      success: false,
      errorCode: code,
      errorMessage:
        result?.error_message ??
        BOOKING_ERROR_MESSAGES_IT[code] ??
        BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bookingId: result.booking_id,
    status: result.status,
    action: result.action === "reject" ? "reject" : "approve",
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

function buildSlotsForRoom(
  date: string,
  room: Room,
  durationMinutes: number,
  bookings: Array<{
    id: string;
    start_at: string;
    end_at: string;
    status?: BookingStatus;
  }>,
  settings: BookingSettings,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const closeStartMinutes = room.close_hour * 60;
  const priceEur = calculateBookingPrice(room, durationMinutes);

  for (
    let startMinutes = room.open_hour * 60;
    startMinutes + durationMinutes <= closeStartMinutes;
    startMinutes += room.slot_granularity_minutes
  ) {
    const hour = Math.floor(startMinutes / 60);
    const minute = startMinutes % 60;
    const startAt = romeLocalToUtcIso(date, hour, minute);
    const endAt = addMinutesIso(startAt, durationMinutes);
    const overlapping = bookings.find(
      (b) => b.start_at < endAt && b.end_at > startAt,
    );
    const leadTimeCategory = getLeadTimeCategory(startAt, settings);
    const available = !overlapping && leadTimeCategory !== "too_late";

    slots.push({
      startAt,
      endAt,
      label: formatSlotRangeLabel(startAt, endAt),
      available,
      bookingId: overlapping?.id,
      status: overlapping?.status,
      priceEur,
      leadTimeCategory,
    });
  }

  return slots;
}

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

function formatSlotRangeLabel(startAt: string, endAt: string): string {
  const timeFmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: BOOKING_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${timeFmt.format(new Date(startAt))} – ${timeFmt.format(new Date(endAt))}`;
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
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

export function formatBookingDateTime(startAt: string, endAt: string): string {
  const dateFmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: BOOKING_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: BOOKING_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

  const start = new Date(startAt);
  const end = new Date(endAt);

  return `${dateFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

export function bookingPaymentMethodLabel(
  method: BookingPaymentMethod | string | null | undefined,
): string | null {
  if (!method) return null;

  switch (method) {
    case "stripe":
      return "Carta (Stripe)";
    case "credits":
      return "Crediti";
    default:
      return method;
  }
}

export function formatCreditsCount(count: number): string {
  return count === 1 ? "1 credito" : `${count} crediti`;
}

export function bookingStatusLabel(
  status: BookingStatus,
  paymentStatus?: BookingPaymentStatus,
): string {
  switch (status) {
    case "confirmed":
      return "Confermata";
    case "pending":
      if (paymentStatus === "paid") return "Confermata";
      if (paymentStatus === "link_sent") return "In attesa pagamento";
      return "In attesa pagamento";
    case "pending_approval":
      return "In attesa approvazione";
    case "cancelled":
      return "Annullata";
    default:
      return status;
  }
}

export function todayInRome(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type SettlementMethod = "credits" | "cash" | "original_method";

export interface AdminBookingDetail extends AdminBookingListItem {}

export interface AdminBookingUpdateInput {
  roomId: string;
  startAt: string;
  endAt: string;
  notes?: string | null;
  settlementMethod?: SettlementMethod;
}

export interface AdminBookingUpdateResult {
  success: boolean;
  bookingId?: string;
  totalPriceEur?: number;
  durationMinutes?: number;
  priceChanged?: boolean;
  creditDiff?: number;
  errorCode?: BookingErrorCode | string;
  errorMessage?: string;
}

export interface BookingAuditLogEntry {
  id: string;
  bookingId: string;
  actorMemberId: string | null;
  action: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

interface AdminUpdateBookingSafeResponse {
  success: boolean;
  booking_id?: string;
  total_price_eur?: number;
  duration_minutes?: number;
  price_changed?: boolean;
  credit_diff?: number;
  error_code?: string;
  error_message?: string;
}

type BookingAuditLogRow = {
  id: string;
  booking_id: string;
  actor_member_id: string | null;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: string;
};

const BOOKING_AUDIT_COLUMNS =
  "id, booking_id, actor_member_id, action, changes, created_at";

export async function getAdminBookingById(
  client: BookingsClient,
  bookingId: string,
): Promise<AdminBookingDetail | null> {
  const { data, error } = await client
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare la prenotazione: ${error.message}`);
  }

  if (!data) return null;

  const booking = data as Booking;

  const [{ data: room }, { data: member }] = await Promise.all([
    client.from("rooms").select("id, name, slug").eq("id", booking.room_id).maybeSingle(),
    client
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("id", booking.member_id)
      .maybeSingle(),
  ]);

  return {
    ...booking,
    room: (room as Pick<Room, "id" | "name" | "slug"> | null) ?? null,
    member: member ?? null,
  };
}

export async function adminUpdateBooking(
  client: BookingsClient,
  bookingId: string,
  input: AdminBookingUpdateInput,
): Promise<AdminBookingUpdateResult> {
  const durationMinutes = Math.round(
    (new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 60_000,
  );

  const { data, error } = await client.rpc("admin_update_booking_safe", {
    p_booking_id: bookingId,
    p_room_id: input.roomId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_duration_minutes: durationMinutes,
    p_notes: input.notes?.trim() || null,
    p_settlement_method: input.settlementMethod ?? null,
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as AdminUpdateBookingSafeResponse | null;

  if (!result?.success) {
    const code = (result?.error_code ?? "UNKNOWN") as BookingErrorCode;
    return {
      success: false,
      errorCode: code,
      errorMessage:
        result?.error_message ??
        BOOKING_ERROR_MESSAGES_IT[code] ??
        BOOKING_ERROR_MESSAGES_IT.UNKNOWN,
    };
  }

  return {
    success: true,
    bookingId: result.booking_id,
    totalPriceEur: result.total_price_eur,
    durationMinutes: result.duration_minutes,
    priceChanged: result.price_changed,
    creditDiff: result.credit_diff,
  };
}

export async function listBookingAuditLog(
  client: BookingsClient,
  bookingId: string,
): Promise<BookingAuditLogEntry[]> {
  const { data, error } = await client
    .from("booking_audit_log")
    .select(BOOKING_AUDIT_COLUMNS)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Impossibile caricare lo storico: ${error.message}`);
  }

  const rows = (data ?? []) as BookingAuditLogRow[];
  if (rows.length === 0) return [];

  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.actor_member_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let actorById = new Map<
    string,
    { id: string; first_name: string; last_name: string }
  >();

  if (actorIds.length > 0) {
    const { data: actors, error: actorsError } = await client
      .from("members")
      .select("id, first_name, last_name")
      .in("id", actorIds);

    if (actorsError) {
      throw new Error(
        `Impossibile caricare gli autori dello storico: ${actorsError.message}`,
      );
    }

    actorById = new Map((actors ?? []).map((actor) => [actor.id, actor]));
  }

  return rows.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    actorMemberId: row.actor_member_id,
    action: row.action,
    changes: row.changes,
    createdAt: row.created_at,
    actor: row.actor_member_id
      ? (actorById.get(row.actor_member_id) ?? null)
      : null,
  }));
}

export function bookingAuditActionLabel(action: string): string {
  switch (action) {
    case "admin_update":
      return "Modifica admin";
    default:
      return action;
  }
}

/** Converte datetime-local (Europe/Rome) in ISO UTC. */
export function romeLocalInputToUtcIso(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  if (!datePart || !timePart) {
    throw new Error("Data/ora non valida.");
  }
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
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
    offsetMinutes = sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  }

  return new Date(guess - offsetMinutes * 60_000).toISOString();
}

/** Formato datetime-local da ISO UTC (Europe/Rome). */
export function utcIsoToRomeLocalInput(iso: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function settlementMethodLabel(method: SettlementMethod): string {
  switch (method) {
    case "credits":
      return "Crediti";
    case "cash":
      return "Contanti";
    case "original_method":
      return "Metodo originale";
    default:
      return method;
  }
}
