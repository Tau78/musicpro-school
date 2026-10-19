import { createClient } from "@supabase/supabase-js";

import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";

const ROME = "Europe/Rome";

export type BookingEmailTemplate = "confirm" | "modified" | "cancelled";

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
  microphone_count: number | null;
  notes: string | null;
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
  admin_sent?: boolean;
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
  if (m === 30) return `${h},5 ore`;
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
      microphone_count,
      notes,
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

async function getAdminNotifyEmails(): Promise<string[]> {
  const client = serviceClient();
  const { data, error } = await client
    .from("app_settings")
    .select("key, value")
    .in("key", ["admin_email", "segreteria_email"]);

  if (error) {
    console.error("[booking-email] admin emails:", error.message);
    return [];
  }

  const emails = new Set<string>();
  for (const row of data ?? []) {
    const value = typeof row.value === "string" ? row.value.trim().toLowerCase() : "";
    if (value && value.includes("@")) emails.add(value);
  }
  return [...emails];
}

/** Collaboratori con flag Email prenotazioni: copia sulle mail della sala. */
async function getCollaboratorBookingCcEmails(
  excludeEmail: string | null,
): Promise<string[]> {
  const client = serviceClient();
  const { data: roles, error: roleError } = await client
    .from("member_roles")
    .select("member_id")
    .eq("role", "collaboratore")
    .is("revoked_at", null);

  if (roleError || !roles?.length) {
    if (roleError) {
      console.error("[booking-email] cc roles:", roleError.message);
    }
    return [];
  }

  const ids = [...new Set(roles.map((row) => row.member_id))];
  const { data: members, error } = await client
    .from("members")
    .select("email")
    .in("id", ids)
    .eq("booking_email_cc", true)
    .eq("is_active", true);

  if (error) {
    console.error("[booking-email] cc emails:", error.message);
    return [];
  }

  const exclude = excludeEmail?.trim().toLowerCase() ?? "";
  const emails = new Set<string>();
  for (const row of members ?? []) {
    const email = row.email?.trim().toLowerCase();
    if (email && email.includes("@") && email !== exclude) emails.add(email);
  }
  return [...emails];
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

function buildUpgradeGratuitoEmail(booking: BookingRow): {
  subject: string;
  html: string;
  text: string;
  recipientEmail: string;
} {
  const recipientEmail = booking.members?.email?.trim() ?? "";
  if (!recipientEmail) {
    throw new Error("Email associato mancante.");
  }

  const firstName = booking.members?.first_name?.trim() || "associato";
  const roomName = booking.rooms?.name ?? "Sala";
  const whenLine = `${formatDateTimeRome(booking.start_at)} – ${formatTimeRome(booking.end_at)}`;
  const duration = formatDuration(booking.duration_minutes);
  const subject = "Upgrade gratuito sulla tua prenotazione — MusicPro School";
  const myBookingsUrl = `${appUrl()}/prenotazioni/mie`;

  const text = [
    `Ciao ${firstName},`,
    "",
    "ti abbiamo omaggiato di un upgrade gratuito.",
    "",
    "Abbiamo aggiornato la prenotazione. La differenza di prezzo resta a carico della scuola: non devi pagare nulla in più.",
    "",
    `Sala: ${roomName}`,
    `Quando: ${whenLine}`,
    `Durata: ${duration}`,
    "",
    "Ti aspettiamo in sala.",
    "MusicPro School",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="margin:0;padding:24px;background:#f6f3ec;font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6dfd0;">
    <tr>
      <td style="background:#1e3a5f;padding:20px 24px;">
        <p style="margin:0;color:#c9a227;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">MusicPro School</p>
        <p style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">Upgrade gratuito</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 12px;">Ciao <strong>${escapeHtml(firstName)}</strong>,</p>
        <p style="margin:0 0 12px;">ti abbiamo omaggiato di un upgrade gratuito.</p>
        <p style="margin:0 0 16px;">Abbiamo aggiornato la prenotazione. La differenza di prezzo resta a carico della scuola: non devi pagare nulla in più.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 16px;background:#fafafa;border-radius:8px;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;width:110px;">Sala</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(roomName)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">Quando</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(whenLine)}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;">Durata</td><td style="padding:8px 12px;font-weight:600;">${escapeHtml(duration)}</td></tr>
        </table>
        <p style="margin:0 0 20px;">Ti aspettiamo in sala.</p>
        <a href="${escapeHtml(myBookingsUrl)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Le tue prenotazioni</a>
        <p style="margin:24px 0 0;font-size:12px;color:#888;">MusicPro School</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text, recipientEmail };
}

async function bookingHasUpgradeGratuito(bookingId: string): Promise<boolean> {
  const client = serviceClient();
  const { data, error } = await client
    .from("booking_adjustments")
    .select("settlement_method, direction")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return (
    data.settlement_method === "upgrade_gratuito" && data.direction === "increase"
  );
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
  const recipientEmail = booking.members?.email?.trim() ?? "";
  if (!recipientEmail && template !== "cancelled") {
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
  const cancelPolicy = `Puoi annullare fino a ${options.cancelPolicyHours} ore prima: l'importo torna come crediti sul saldo (meno l'eventuale penale).`;

  const subject = paymentUrl
    ? "Completa il pagamento — prenotazione MusicPro"
    : template === "cancelled"
      ? "La tua prenotazione MusicPro è stata annullata"
      : template === "modified"
        ? "La tua prenotazione MusicPro è stata modificata"
        : "La tua prenotazione MusicPro è stata creata";

  const intro = paymentUrl
    ? "La prenotazione è stata registrata. Per confermarla, completa il pagamento online:"
    : template === "cancelled"
      ? "La prenotazione è stata annullata. Ecco i dettagli:"
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
    ["Microfoni", String(booking.microphone_count ?? 0)],
  ];

  if (booking.band_id && booking.bands?.name) {
    rows.push(["Band", booking.bands.name]);
  }

  if (booking.notes?.trim()) {
    rows.push(["Note", booking.notes.trim()]);
  }

  rows.push(["Prezzo", price]);

  if (creditLine) {
    rows.push(["Crediti", creditLine.replace("Saldo crediti residuo: ", "")]);
  }

  const policyLine =
    template === "cancelled"
      ? "Se la prenotazione era pagata, crediti o rimborso seguono la policy di annullamento."
      : cancelPolicy;

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  const text = [
    `Ciao ${memberName},`,
    "",
    intro,
    "",
    textRows,
    "",
    ...(paymentUrl ? [`Paga online: ${paymentUrl}`, ""] : []),
    policyLine,
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
  <p style="font-size:14px;color:#444;">${escapeHtml(policyLine)}</p>
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

function buildAdminBookingNotifyContent(
  booking: BookingRow,
  template: BookingEmailTemplate,
  options: { paymentUrl?: string | null },
): { subject: string; html: string; text: string } {
  const memberName = booking.members
    ? `${booking.members.first_name} ${booking.members.last_name}`.trim()
    : "Associato";
  const memberEmail = booking.members?.email?.trim() || "—";
  const roomName = booking.rooms?.name ?? "Sala";
  const whenLine = `${formatDateTimeRome(booking.start_at)} – ${formatTimeRome(booking.end_at)}`;
  const price = formatEuro(booking.total_price_eur);
  const bookingRef = shortBookingId(booking.id);
  const paymentUrl = options.paymentUrl?.trim() || null;
  const status = paymentUrl
    ? "In attesa pagamento"
    : statusLabel(booking.status, booking.payment_status);
  const adminUrl = `${appUrl()}/admin/prenotazioni`;

  const subject =
    template === "cancelled"
      ? `Prenotazione annullata — ${memberName}`
      : template === "modified"
        ? `Prenotazione modificata — ${memberName}`
        : `Nuova prenotazione — ${memberName}`;

  const intro =
    template === "cancelled"
      ? "Una prenotazione sala è stata annullata."
      : template === "modified"
        ? "Una prenotazione sala è stata modificata."
        : "È stata creata una nuova prenotazione sala.";

  const text = [
    intro,
    "",
    `Associato: ${memberName} <${memberEmail}>`,
    `Stato: ${status}`,
    `ID: ${bookingRef}`,
    `Quando: ${whenLine}`,
    `Sala: ${roomName}`,
    `Prezzo: ${price}`,
    ...(paymentUrl ? [`Pagamento: ${paymentUrl}`] : []),
    "",
    `Apri admin: ${adminUrl}`,
    "",
    "MusicPro School",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <p>${escapeHtml(intro)}</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fafafa;border-radius:8px;">
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;width:140px;">Associato</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(memberName)} &lt;${escapeHtml(memberEmail)}&gt;</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">Stato</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(status)}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">ID</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(bookingRef)}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">Quando</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(whenLine)}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">Sala</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(roomName)}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">Prezzo</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${escapeHtml(price)}</td></tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#0b3d5c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Apri prenotazioni</a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#888;">MusicPro School — notifica admin</p>
</body>
</html>`;

  return { subject, html, text };
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

async function hasSentEmailSince(
  bookingId: string,
  subject: string,
  sinceIso: string,
): Promise<boolean> {
  const client = serviceClient();
  const { data, error } = await client
    .from("booking_email_log")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("subject", subject)
    .eq("status", "sent")
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[booking-email] duplicate window check failed:", error.message);
    return false;
  }

  return Boolean(data);
}

export async function processBookingEmail(params: {
  bookingId: string;
  template?: BookingEmailTemplate;
  force?: boolean;
  paymentUrl?: string | null;
  upgradeGratuito?: boolean;
}): Promise<BookingEmailProcessResult> {
  const bookingId = params.bookingId.trim();
  const template = params.template ?? "confirm";
  const force = params.force === true;
  const paymentUrl = params.paymentUrl?.trim() || null;

  const booking = await loadBookingForEmail(bookingId);
  if (!booking) {
    return { success: false, message: "Prenotazione non trovata", booking_id: bookingId };
  }

  if (booking.status === "cancelled" && template !== "cancelled") {
    return {
      success: false,
      message: "Prenotazione annullata — email non inviata",
      booking_id: bookingId,
    };
  }

  if (template === "cancelled" && booking.status !== "cancelled") {
    return {
      success: false,
      message: "La prenotazione non risulta annullata",
      booking_id: bookingId,
    };
  }

  const cancelPolicyHours = await getCancelPolicyHours();
  const creditBalance = await getMemberCreditAvailable(booking.member_id);
  const upgradeGratuito =
    template === "modified" &&
    params.upgradeGratuito === true &&
    (await bookingHasUpgradeGratuito(bookingId));

  let content: ReturnType<typeof buildBookingEmailContent>;
  try {
    content = upgradeGratuito
      ? buildUpgradeGratuitoEmail(booking)
      : buildBookingEmailContent(booking, template, {
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
        template === "cancelled"
          ? "Annullamento prenotazione"
          : template === "modified"
            ? "Modifica prenotazione"
            : "Conferma prenotazione",
      status: "failed",
      error: msg,
    });
    return { success: false, message: msg, booking_id: bookingId };
  }

  if (!force) {
    const alreadySent = upgradeGratuito
      ? await hasSentEmailSince(
          bookingId,
          content.subject,
          new Date(Date.now() - 2 * 60_000).toISOString(),
        )
      : await hasRecentSentEmail(bookingId, content.subject);
    if (alreadySent) {
      await logBookingEmail({
        bookingId,
        recipientEmail: content.recipientEmail,
        subject: content.subject,
        status: "skipped",
        error: "Email già inviata in precedenza (usa force per reinviare)",
      });

      // Anche se la mail all'associato era già partita, prova comunque la notifica admin.
      let adminSent = false;
      const adminEmails = (await getAdminNotifyEmails()).filter(
        (email) => email !== content.recipientEmail.toLowerCase(),
      );
      if (adminEmails.length > 0) {
        const adminContent = buildAdminBookingNotifyContent(booking, template, {
          paymentUrl,
        });
        const adminAlready = await hasRecentSentEmail(
          bookingId,
          adminContent.subject,
        );
        if (!adminAlready) {
          const adminDelivery = await sendEnrollmentEmail({
            to: adminEmails,
            subject: adminContent.subject,
            text: adminContent.text,
            html: adminContent.html,
            preferGoogleSmtp: true,
          });
          adminSent = adminDelivery.sent === true;
          await logBookingEmail({
            bookingId,
            recipientEmail: adminEmails.join(", "),
            subject: adminContent.subject,
            status: adminSent ? "sent" : "failed",
            error: adminSent
              ? null
              : (adminDelivery.error ?? "Invio admin fallito"),
          });
        }
      }

      return {
        success: true,
        skipped: true,
        admin_sent: adminSent,
        message: "Email già inviata — skipped",
        booking_id: bookingId,
      };
    }
  }

  const cc = await getCollaboratorBookingCcEmails(content.recipientEmail || null);
  let to = content.recipientEmail ? [content.recipientEmail] : [];
  let ccList = cc;
  if (to.length === 0) {
    to = ccList;
    ccList = [];
  }
  if (to.length === 0) {
    return {
      success: false,
      message: "Email associato mancante.",
      booking_id: bookingId,
    };
  }

  const delivery = await sendEnrollmentEmail({
    to,
    cc: ccList,
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
      recipientEmail: to.join(", "),
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
        recipient: to.join(", "),
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
    recipientEmail: ccList.length
      ? `${to.join(", ")} (cc: ${ccList.join(", ")})`
      : to.join(", "),
    subject: content.subject,
    status: "sent",
  });

  // Notifica admin/segreteria (impostazioni admin_email / segreteria_email).
  let adminSent = false;
  const adminEmails = (await getAdminNotifyEmails()).filter(
    (email) => email !== content.recipientEmail.toLowerCase(),
  );
  if (adminEmails.length > 0) {
    const adminContent = buildAdminBookingNotifyContent(booking, template, {
      paymentUrl,
    });
    const adminDelivery = await sendEnrollmentEmail({
      to: adminEmails,
      subject: adminContent.subject,
      text: adminContent.text,
      html: adminContent.html,
      preferGoogleSmtp: true,
    });
    adminSent = adminDelivery.sent === true;
    await logBookingEmail({
      bookingId,
      recipientEmail: adminEmails.join(", "),
      subject: adminContent.subject,
      status: adminSent ? "sent" : "failed",
      error: adminSent ? null : (adminDelivery.error ?? "Invio admin fallito"),
    });
    if (!adminSent) {
      console.error(
        "[booking-email] admin notify failed:",
        adminDelivery.error,
      );
    }
  }

  return {
    success: true,
    sent: true,
    admin_sent: adminSent,
    message: `Email inviata via ${delivery.via ?? "smtp"}${adminSent ? " (+ admin)" : ""}`,
    booking_id: bookingId,
    subject: content.subject,
    recipient: to.join(", "),
  };
}
