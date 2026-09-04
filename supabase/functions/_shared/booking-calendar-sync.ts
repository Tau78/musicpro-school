import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import {
  deleteCalendarEvent,
  getGoogleAccessToken,
  parseServiceAccountJson,
  upsertCalendarEvent,
} from './google-calendar.ts';
import { edgeUrlEnvFromDeno, publicSchoolUrl } from './public-url.ts';

type BookingRow = {
  id: string;
  room_id: string;
  member_id: string;
  start_at: string;
  end_at: string;
  status: string;
  total_price_eur: number | null;
  duration_minutes: number | null;
  payment_status: string | null;
  notes: string | null;
  google_calendar_event_id: string | null;
  created_at: string;
  paid_at: string | null;
  rooms: {
    name: string;
    slug: string;
    description: string | null;
    google_calendar_color_id: string | null;
  } | null;
  members: {
    first_name: string;
    last_name: string;
    email: string | null;
    member_number: number | null;
    phone: string | null;
  } | null;
};

const ROME = 'Europe/Rome';

function formatDateTimeRome(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: ROME,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 ora' : `${h} ore`;
  return `${h} h ${m} min`;
}

function formatEuro(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function paymentLabel(status: string | null): string {
  switch (status) {
    case 'paid':
      return 'Pagato';
    case 'not_required':
      return 'Non richiesto (admin/docente)';
    case 'link_sent':
      return 'Link pagamento inviato';
    default:
      return 'In attesa di pagamento';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'Confermata';
    case 'pending':
      return 'In attesa pagamento';
    case 'pending_approval':
      return 'In attesa approvazione';
    case 'cancelled':
      return 'Annullata';
    default:
      return status;
  }
}

function buildEventTitle(roomName: string, memberFirst: string, memberLast: string): string {
  const room = roomName.trim().toUpperCase();
  const member = `${memberFirst} ${memberLast}`.trim().toUpperCase();
  return `${room} - ${member}`;
}

function buildEventDescription(
  booking: BookingRow,
  calendarId: string,
  htmlLink?: string,
): string {
  const room = booking.rooms;
  const member = booking.members;
  const schoolUrl = publicSchoolUrl(edgeUrlEnvFromDeno());

  const lines = [
    '═══════════════════════════════════════',
    '  PRENOTAZIONE SALA — MusicPro School',
    '═══════════════════════════════════════',
    '',
    '🏠 SALA',
    `Nome: ${room?.name ?? '—'}`,
    `Codice: ${room?.slug ?? '—'}`,
    room?.description ? `Info: ${room.description}` : null,
    '',
    '👤 ASSOCIATO',
    `Nome: ${member ? `${member.first_name} ${member.last_name}`.trim() : '—'}`,
    member?.member_number != null ? `N. associato: ${member.member_number}` : null,
    member?.email ? `Email: ${member.email}` : null,
    member?.phone ? `Telefono: ${member.phone}` : null,
    '',
    '📅 ORARIO (Europe/Rome)',
    `Inizio: ${formatDateTimeRome(booking.start_at)}`,
    `Fine:   ${formatDateTimeRome(booking.end_at)}`,
    `Durata: ${formatDuration(booking.duration_minutes)}`,
    '',
    '💰 PAGAMENTO',
    `Importo: ${formatEuro(booking.total_price_eur)}`,
    `Stato pagamento: ${paymentLabel(booking.payment_status)}`,
    booking.paid_at ? `Pagato il: ${formatDateTimeRome(booking.paid_at)}` : null,
    '',
    '📋 PRENOTAZIONE',
    `Stato: ${statusLabel(booking.status)}`,
    `ID: ${booking.id}`,
    `Creata il: ${formatDateTimeRome(booking.created_at)}`,
    booking.notes?.trim() ? `Note utente: ${booking.notes.trim()}` : null,
    '',
    '🔗 LINK',
    `Le mie prenotazioni: ${schoolUrl}/prenotazioni/mie`,
    `Admin prenotazioni: ${schoolUrl}/admin/prenotazioni`,
    htmlLink ? `Evento Google Calendar: ${htmlLink}` : null,
    '',
    '📆 CALENDARIO',
    `Calendar ID: ${calendarId}`,
    '',
    '— Sincronizzato automaticamente da MusicPro School',
  ];

  return lines.filter((line) => line != null).join('\n');
}

async function loadCalendarId(service: SupabaseClient): Promise<string> {
  const envId = Deno.env.get('BOOKING_GOOGLE_CALENDAR_ID')?.trim();
  if (envId) return envId;

  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'booking_google_calendar_id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  const id = data?.value?.trim();
  if (!id) {
    throw new Error('booking_google_calendar_id non configurato.');
  }
  return id;
}

async function loadBooking(service: SupabaseClient, bookingId: string): Promise<BookingRow> {
  const { data, error } = await service
    .from('bookings')
    .select(`
      id,
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes,
      payment_status,
      notes,
      google_calendar_event_id,
      created_at,
      paid_at,
      rooms ( name, slug, description, google_calendar_color_id ),
      members!bookings_member_id_fkey ( first_name, last_name, email, member_number, phone )
    `)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Prenotazione non trovata.');

  return data as unknown as BookingRow;
}

async function markSync(
  service: SupabaseClient,
  bookingId: string,
  googleEventId: string | null,
  error: string | null,
): Promise<void> {
  const { error: rpcError } = await service.rpc('mark_booking_calendar_sync', {
    p_booking_id: bookingId,
    p_google_event_id: googleEventId,
    p_error: error,
  });
  if (rpcError) console.error('[booking-calendar-sync] mark_sync', rpcError.message);
}

async function clearEventId(service: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await service.rpc('clear_booking_calendar_event', {
    p_booking_id: bookingId,
  });
  if (error) console.error('[booking-calendar-sync] clear_event', error.message);
}

export type SyncBookingCalendarResult = {
  success: boolean;
  action?: 'upsert' | 'delete' | 'skip';
  booking_id?: string;
  google_event_id?: string | null;
  message?: string;
};

export async function syncBookingToGoogleCalendar(
  service: SupabaseClient,
  bookingId: string,
  action: 'upsert' | 'delete' = 'upsert',
): Promise<SyncBookingCalendarResult> {
  const saRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '';
  const sa = parseServiceAccountJson(saRaw);
  if (!sa) {
    return {
      success: false,
      message: 'GOOGLE_SERVICE_ACCOUNT_JSON non configurato su Edge.',
    };
  }

  const actAs = Deno.env.get('GOOGLE_CALENDAR_ACT_AS_EMAIL')?.trim() || null;

  const booking = await loadBooking(service, bookingId);
  const calendarId = await loadCalendarId(service);

  const token = await getGoogleAccessToken(sa, actAs);

  if (action === 'delete' || booking.status === 'cancelled') {
    const eventId = booking.google_calendar_event_id?.trim();
    if (!eventId) {
      return {
        success: true,
        action: 'skip',
        booking_id: bookingId,
        message: 'Nessun evento da eliminare.',
      };
    }
    await deleteCalendarEvent(token, calendarId, eventId);
    await clearEventId(service, bookingId);
    return { success: true, action: 'delete', booking_id: bookingId };
  }

  if (booking.status !== 'confirmed') {
    return {
      success: true,
      action: 'skip',
      booking_id: bookingId,
      message: `Stato ${booking.status}: sync solo su confirmed.`,
    };
  }

  const room = booking.rooms;
  const member = booking.members;
  if (!room || !member) {
    throw new Error('Dati sala o associato mancanti.');
  }

  const summary = buildEventTitle(room.name, member.first_name, member.last_name);
  const location = `MusicPro School — Sala ${room.name}`;

  const result = await upsertCalendarEvent(token, {
    summary,
    description: buildEventDescription(booking, calendarId),
    location,
    startIso: booking.start_at,
    endIso: booking.end_at,
    calendarId,
    existingEventId: booking.google_calendar_event_id,
    colorId: room.google_calendar_color_id,
    musicproBookingId: booking.id,
  });

  if (result.htmlLink) {
    try {
      await upsertCalendarEvent(token, {
        summary,
        description: buildEventDescription(booking, calendarId, result.htmlLink),
        location,
        startIso: booking.start_at,
        endIso: booking.end_at,
        calendarId,
        existingEventId: result.id,
        colorId: room.google_calendar_color_id,
        musicproBookingId: booking.id,
      });
    } catch (linkErr) {
      console.error('[booking-calendar-sync] htmlLink update', linkErr);
    }
  }

  await markSync(service, bookingId, result.id, null);

  return {
    success: true,
    action: 'upsert',
    booking_id: bookingId,
    google_event_id: result.id,
  };
}
