import { createClient } from "@supabase/supabase-js";

import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";

const ROME = "Europe/Rome";

export type BookingEmailTemplate = "confirm" | "modified";

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
  payment_method: string | null;
  provi_da_solo: boolean;
  band_id: string | null;
  member_snapshot: Array<{
    member_id: string;
    first_name: string;
    last_name: string;
  }> | null;
  rooms: { name: string; slug: string } | null;
  bands: { name: string } | null;
  members: {
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
};

export interface BookingEmailProcessResult {
  success: boolean;
  skipped?: boolean;
  sent?: boolean;
  dev_mode?: boolean;
  message?: string;
  booking_id?: string;
  subject?: string;
  recipient?: string;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Config Supabase server mancante");
  }
  return createClient(url, key);
}

function appUrl(): string {
  return authPublicOrigin(process.env);
}

function formatDateTimeRome(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatTimeRome(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 ora" : `${h} ore`;
  return `${h} h ${m} min`;
}

function formatEuro(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function statusLabel(status: string, paymentStatus: string | null): string {
  switch (status) {
    case "confirmed":
      return "Confermata";
    case "pending_approval":
      return "In attesa di approvazione";
    case "pending":
      if (paymentStatus === "paid") return "Confermata";
      if (paymentStatus === "link_sent") return "In attesa pagamento";
      return "In attesa pagamento";
    case "cancelled":
      return "Annullata";
    default:
      return status;
  }
}

function shortBookingId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadBookingForEmail(bookingId: string): Promise<BookingRow | null> {
  const client = serviceClient();
  const { data, error } = await client
    .from("bookings")
    .select(
      `
      id,
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes,
      payment_status,
      payment_method,
      provi_da_solo,
      band_id,
      member_snapshot,
      rooms ( name, slug ),
      bands ( name ),
      members!bookings_member_id_fkey ( first_name, last_name, email )
    `,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare la prenotazione: ${error.message}`);
  }

  return (data as BookingRow | null) ?? null;
}

async function getCancelPolicyHours(): Promise<number> {
  const client = serviceClient();
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", "booking_cancel_min_hours")
    .maybeSingle();

  if (error || !data?.value) return 24;
  const parsed = parseInt(String(data.value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

async function getMemberCreditAvailable(memberId: string): Promise<number | null> {
  const client = serviceClient();
  const { data, error } = await client.rpc("get_member_credit_balance", {
    p_member_id: memberId,
  });

  if (error) return null;

  const result = data as { available?: number; success?: boolean } | null;
  if (result?.success === false) return null;
  return typeof result?.available === "number" ? result.available : null;
}

function buildBookingEmailContent(
  booking: BookingRow,
  template: BookingEmailTemplate,
  options: {
    cancelPolicyHours: number;
    creditBalance: number | null;
    paymentUrl?: string | null;
  },
): {
  subject: string;
  html: string;
  text: string;
  recipientEmail: string;
} {
  const recipientEmail = booking.members?.email?.trim();
  if (!recipientEmail) {
    throw new Error("Email associato mancante.");
  }

  const memberName = booking.members
    ? `${booking.members.first_name} ${booking.members.last_name}`.trim()
    : "Associato";
  const roomName = booking.rooms?.name ?? "Sala";
  const whenLine = `${formatDateTimeRome(booking.start_at)} – ${formatTimeRome(booking.end_at)}`;
  const duration = formatDuration(booking.duration_minutes);
  const proviLabel = booking.provi_da_solo ? "Sì" : "No";
  const price = formatEuro(booking.total_price_eur);
  const paymentUrl = options.paymentUrl?.trim() || null;
  const status = paymentUrl
    ? "In attesa pagamento"
    : statusLabel(booking.status, booking.payment_status);
  const bookingRef = shortBookingId(booking.id);
  const base = appUrl();
  const myBookingsUrl = `${base}/prenotazioni/mie`;
  const shopUrl = `${base}/dashboard/shop`;
  const cancelPolicy = `Puoi annullare gratuitamente fino a ${options.cancelPolicyHours} ore prima dell'inizio della prenotazione.`;

  const subject = paymentUrl
    ? "Completa il pagamento — prenotazione MusicPro"
    : template === "modified"
      ? "La tua prenotazione MusicPro è stata modificata"
      : "La tua prenotazione MusicPro è stata creata";

  const intro = paymentUrl
    ? "La prenotazione è stata registrata. Per confermarla, completa il pagamento online:"
    : template === "modified"
      ? "La prenotazione è stata aggiornata. Ecco i dettagli:"
      : "La prenotazione è stata creata. Ecco i dettagli:";

  const creditLine =
    options.creditBalance != null
      ? `Saldo crediti residuo: ${options.creditBalance} ${options.creditBalance === 1 ? "credito" : "crediti"}`
      : null;

  const rows: Array<[string, string]> = [
    ["Stato", status],
    ["ID prenotazione", bookingRef],
    ["Quando", whenLine],
    ["Sala", roomName],
    ["Durata", duration],
    ["Provi da solo?", proviLabel],
  ];

  if (booking.band_id && booking.bands?.name) {
    rows.push(["Band", booking.bands.name]);
  }

  rows.push(["Prezzo", price]);

  if (creditLine) {
    rows.push(["Crediti", creditLine.replace("Saldo crediti residuo: ", "")]);
  }

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  const text = [
    `Ciao ${memberName},`,
    "",
    intro,
    "",
    textRows,
    "",
    ...(paymentUrl ? [`Paga online: ${paymentUrl}`, ""] : []),
    cancelPolicy,
    "",
    `Le tue prenotazioni: ${myBookingsUrl}`,
    `Acquista crediti (SHOP): ${shopUrl}`,
    "",
    "MusicPro School",
  ].join("\n");

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;width:140px;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <p>Ciao <strong>${escapeHtml(memberName)}</strong>,</p>
  <p>${escapeHtml(intro)}</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fafafa;border-radius:8px;">
    ${htmlRows}
  </table>
  <p style="font-size:14px;color:#444;">${escapeHtml(cancelPolicy)}</p>
  ${
    paymentUrl
      ? `<p style="margin-top:24px;">
    <a href="${escapeHtml(paymentUrl)}" style="display:inline-block;background:#c41e3a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">Paga ora</a>
  </p>`
      : ""
  }
  <p style="margin-top:24px;">
    <a href="${myBookingsUrl}" style="display:inline-block;background:#c41e3a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Le mie prenotazioni</a>
    &nbsp;
    <a href="${shopUrl}" style="display:inline-block;border:1px solid #c41e3a;color:#c41e3a;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">SHOP crediti</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">MusicPro School</p>
</body>
</html>`;

  return { subject, html, text, recipientEmail };
}

async function logBookingEmail(params: {
  bookingId: string;
  recipientEmail: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
}): Promise<void> {
  const client = serviceClient();
  const { error } = await client.from("booking_email_log").insert({
    booking_id: params.bookingId,
    recipient_email: params.recipientEmail,
    subject: params.subject,
    status: params.status,
    error: params.error ?? null,
  });

  if (error) {
    console.error("[booking-email] log insert failed:", error.message);
  }
}

async function hasRecentSentEmail(
  bookingId: string,
  subject: string,
): Promise<boolean> {
  const client = serviceClient();
  const { data, error } = await client
    .from("booking_email_log")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("subject", subject)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[booking-email] duplicate check failed:", error.message);
    return false;
  }

  return Boolean(data);
}

export async function processBookingEmail(params: {
  bookingId: string;
  template?: BookingEmailTemplate;
  force?: boolean;
  paymentUrl?: string | null;
}): Promise<BookingEmailProcessResult> {
  const bookingId = params.bookingId.trim();
  const template = params.template ?? "confirm";
  const force = params.force === true;
  const paymentUrl = params.paymentUrl?.trim() || null;

  const booking = await loadBookingForEmail(bookingId);
  if (!booking) {
    return { success: false, message: "Prenotazione non trovata", booking_id: bookingId };
  }

  if (booking.status === "cancelled") {
    return {
      success: false,
      message: "Prenotazione annullata — email non inviata",
      booking_id: bookingId,
    };
  }

  const cancelPolicyHours = await getCancelPolicyHours();
  const creditBalance = await getMemberCreditAvailable(booking.member_id);

  let content: ReturnType<typeof buildBookingEmailContent>;
  try {
    content = buildBookingEmailContent(booking, template, {
      cancelPolicyHours,
      creditBalance,
      paymentUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logBookingEmail({
      bookingId,
      recipientEmail: booking.members?.email ?? "unknown",
      subject:
        template === "modified" ? "Modifica prenotazione" : "Conferma prenotazione",
      status: "failed",
      error: msg,
    });
    return { success: false, message: msg, booking_id: bookingId };
  }

  if (!force) {
    const alreadySent = await hasRecentSentEmail(bookingId, content.subject);
    if (alreadySent) {
      await logBookingEmail({
        bookingId,
        recipientEmail: content.recipientEmail,
        subject: content.subject,
        status: "skipped",
        error: "Email già inviata in precedenza (usa force per reinviare)",
      });
      return {
        success: true,
        skipped: true,
        message: "Email già inviata — skipped",
        booking_id: bookingId,
      };
    }
  }

  const delivery = await sendEnrollmentEmail({
    to: [content.recipientEmail],
    subject: content.subject,
    text: content.text,
    html: content.html,
    preferGoogleSmtp: true,
  });

  if (!delivery.sent) {
    const isDevSkip =
      delivery.error?.includes("GOOGLE_SMTP") ||
      delivery.error?.includes("Nessun trasporto email");

    await logBookingEmail({
      bookingId,
      recipientEmail: content.recipientEmail,
      subject: content.subject,
      status: isDevSkip ? "skipped" : "failed",
      error: delivery.error ?? "Invio fallito",
    });

    if (isDevSkip) {
      return {
        success: true,
        skipped: true,
        dev_mode: true,
        message:
          "Trasporto email non configurato — registrata come skipped (dev mode)",
        booking_id: bookingId,
        subject: content.subject,
        recipient: content.recipientEmail,
      };
    }

    return {
      success: false,
      message: delivery.error ?? "Invio email fallito",
      booking_id: bookingId,
    };
  }

  await logBookingEmail({
    bookingId,
    recipientEmail: content.recipientEmail,
    subject: content.subject,
    status: "sent",
  });

  return {
    success: true,
    sent: true,
    message: `Email inviata via ${delivery.via ?? "smtp"}`,
    booking_id: bookingId,
    subject: content.subject,
    recipient: content.recipientEmail,
  };
}
