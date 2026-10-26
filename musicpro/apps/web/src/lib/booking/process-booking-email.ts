import { bookingPaymentMethodLabel } from "@musicpro/database";
import { createClient } from "@supabase/supabase-js";

import { authPublicOrigin } from "@/lib/auth/redirect-url";
import {
  escapeEmailHtml,
  schoolEmailHeroHtml,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "@/lib/email/school-email-layout";
import {
  sendEnrollmentEmail,
  type EnrollmentAttachment,
} from "@/lib/iscrizione/email-transport";
import {
  fiscalReceiptAttachmentForRoomBooking,
  markReceiptEmailedIfSent,
} from "@/lib/lezioni/issue-receipt-copy";

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

function formatDateRome(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
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

function formatWhenRange(startIso: string, endIso: string): string {
  const startDay = formatDateRome(startIso);
  const endDay = formatDateRome(endIso);
  if (startDay === endDay) {
    return `${startDay} · ${formatTimeRome(startIso)} – ${formatTimeRome(endIso)}`;
  }
  return `${formatDateTimeRome(startIso)} – ${formatDateTimeRome(endIso)}`;
}

function paymentSummaryLine(
  booking: BookingRow,
  paymentUrl?: string | null,
): string | null {
  if (paymentUrl) return "Da completare online";
  const method = bookingPaymentMethodLabel(booking.payment_method);
  if (booking.payment_status === "paid") {
    return method ? `Pagata · ${method}` : "Pagata";
  }
  if (booking.payment_status === "not_required") {
    if (booking.payment_method === "credits") return "Pagata con crediti";
    return null;
  }
  if (booking.payment_status === "unpaid" || booking.payment_status === "link_sent") {
    return "In attesa di pagamento";
  }
  return method;
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

const escapeHtml = escapeEmailHtml;

function detailTableHtml(rows: Array<[string, string]>): string {
  const htmlRows = rows
    .map(
      ([label, value], index) =>
        `<tr><td style="padding:10px 14px;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #eee"};color:#6b7280;width:120px;font-size:14px;">${escapeHtml(label)}</td><td style="padding:10px 14px;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #eee"};font-weight:600;font-size:15px;color:#111827;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px;background:#faf8f3;border-radius:10px;">${htmlRows}</table>`;
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
  const whenLine = formatWhenRange(booking.start_at, booking.end_at);
  const duration = formatDuration(booking.duration_minutes);
  const subject = "Upgrade gratuito sulla tua prenotazione — MusicPro School";
  const origin = appUrl();
  const myBookingsUrl = `${origin}/prenotazioni/mie`;

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
    `Le tue prenotazioni: ${myBookingsUrl}`,
    schoolEmailTextFooter(),
  ].join("\n");

  const htmlBody = `
        <p style="margin:0 0 12px;">Ciao <strong>${escapeHtml(firstName)}</strong>,</p>
        <p style="margin:0 0 12px;">ti abbiamo omaggiato di un upgrade gratuito.</p>
        <p style="margin:0 0 16px;">Abbiamo aggiornato la prenotazione. La differenza di prezzo resta a carico della scuola: non devi pagare nulla in più.</p>
        ${schoolEmailHeroHtml("Sala prove", roomName, whenLine)}
        ${detailTableHtml([["Durata", duration]])}
        <p style="margin:16px 0 0;">Ti aspettiamo in sala.</p>`;

  const html = wrapSchoolEmail({
    appOrigin: origin,
    preheader: `Upgrade gratuito · ${roomName} · ${whenLine}`,
    title: "Upgrade gratuito",
    htmlBody,
    ctas: [{ href: myBookingsUrl, label: "Le tue prenotazioni" }],
  });

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
  const firstName = booking.members?.first_name?.trim() || memberName;
  const roomName = booking.rooms?.name ?? "Sala";
  const whenLine = formatWhenRange(booking.start_at, booking.end_at);
  const duration = formatDuration(booking.duration_minutes);
  const price = formatEuro(booking.total_price_eur);
  const paymentUrl = options.paymentUrl?.trim() || null;
  const origin = appUrl();
  const myBookingsUrl = `${origin}/prenotazioni/mie`;
  const cancelPolicy = `Puoi annullare fino a ${options.cancelPolicyHours} ore prima: l'importo torna come crediti sul saldo (meno l'eventuale penale).`;

  const subject = paymentUrl
    ? "Completa il pagamento — prenotazione MusicPro"
    : template === "cancelled"
      ? "La tua prenotazione MusicPro è stata annullata"
      : template === "modified"
        ? "La tua prenotazione MusicPro è stata modificata"
        : "La tua prenotazione MusicPro è stata creata";

  const title =
    template === "cancelled"
      ? "Prenotazione annullata"
      : template === "modified"
        ? "Prenotazione aggiornata"
        : paymentUrl
          ? "Completa il pagamento"
          : "Prenotazione confermata";

  const intro = paymentUrl
    ? "La prenotazione è registrata. Per confermarla, completa il pagamento online."
    : template === "cancelled"
      ? "La prenotazione è stata annullata."
      : template === "modified"
        ? "Abbiamo aggiornato la tua prenotazione in sala."
        : "Ti aspettiamo in sala. Ecco il riepilogo.";

  const paymentLine = paymentSummaryLine(booking, paymentUrl);

  const rows: Array<[string, string]> = [["Durata", duration]];

  if (booking.band_id && booking.bands?.name) {
    rows.push(["Band", booking.bands.name]);
  }

  if (booking.provi_da_solo) {
    rows.push(["Provi da solo", "Sì"]);
  }
  if ((booking.microphone_count ?? 0) > 0) {
    rows.push(["Microfoni", String(booking.microphone_count)]);
  }

  rows.push(["Importo", price]);
  if (paymentLine) rows.push(["Pagamento", paymentLine]);

  if (booking.notes?.trim()) {
    rows.push(["Note", booking.notes.trim()]);
  }

  if (options.creditBalance != null) {
    const n = options.creditBalance;
    rows.push(["Saldo crediti", `${n} ${n === 1 ? "credito" : "crediti"}`]);
  }

  const policyLine =
    template === "cancelled"
      ? "Se la prenotazione era pagata, crediti o rimborso seguono la policy di annullamento."
      : cancelPolicy;

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  const text = [
    `Ciao ${firstName},`,
    "",
    intro,
    "",
    `Sala: ${roomName}`,
    `Quando: ${whenLine}`,
    textRows,
    "",
    ...(paymentUrl ? [`Paga online: ${paymentUrl}`, ""] : []),
    policyLine,
    "",
    `Le tue prenotazioni: ${myBookingsUrl}`,
    schoolEmailTextFooter(),
  ].join("\n");

  const htmlBody = `
        <p style="margin:0 0 14px;">Ciao <strong>${escapeHtml(firstName)}</strong>,</p>
        <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
        ${schoolEmailHeroHtml("Sala prove", roomName, whenLine)}
        ${detailTableHtml(rows)}
        <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4b5563;">${escapeHtml(policyLine)}</p>`;

  const ctas = [
    ...(paymentUrl
      ? [{ href: paymentUrl, label: "Paga ora" as const }]
      : []),
    {
      href: myBookingsUrl,
      label: "Le tue prenotazioni",
      variant: paymentUrl ? ("secondary" as const) : undefined,
    },
  ];

  const html = wrapSchoolEmail({
    appOrigin: origin,
    preheader: `${roomName} · ${whenLine}`,
    title,
    htmlBody,
    ctas,
  });

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
  const whenLine = formatWhenRange(booking.start_at, booking.end_at);
  const price = formatEuro(booking.total_price_eur);
  const bookingRef = shortBookingId(booking.id);
  const paymentUrl = options.paymentUrl?.trim() || null;
  const status = paymentUrl
    ? "In attesa pagamento"
    : statusLabel(booking.status, booking.payment_status);
  const origin = appUrl();
  const adminUrl = `${origin}/admin/prenotazioni`;
  const paymentLine = paymentSummaryLine(booking, paymentUrl);

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

  const adminRows: Array<[string, string]> = [
    ["Associato", `${memberName} <${memberEmail}>`],
    ["Stato", status],
    ["Quando", whenLine],
    ["Sala", roomName],
    ["Importo", price],
  ];
  if (paymentLine) adminRows.push(["Pagamento", paymentLine]);
  adminRows.push(["Rif.", bookingRef]);

  const text = [
    intro,
    "",
    ...adminRows.map(([label, value]) => `${label}: ${value}`),
    ...(paymentUrl ? [`Link pagamento: ${paymentUrl}`] : []),
    "",
    `Apri admin: ${adminUrl}`,
    schoolEmailTextFooter({ showAppDownload: false }),
  ].join("\n");

  const htmlBody = `
        <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
        ${detailTableHtml(adminRows)}`;

  const html = wrapSchoolEmail({
    appOrigin: origin,
    preheader: `${memberName} · ${roomName} · ${whenLine}`,
    kicker: "Notifica staff",
    title:
      template === "cancelled"
        ? "Prenotazione annullata"
        : template === "modified"
          ? "Prenotazione modificata"
          : "Nuova prenotazione",
    htmlBody,
    ctas: [{ href: adminUrl, label: "Apri prenotazioni" }],
    showAppDownload: false,
  });

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

  let receiptAttachments: EnrollmentAttachment[] | undefined;
  let receiptIdForMark: string | null = null;
  if (template === "confirm" && booking.payment_status === "paid") {
    try {
      const receiptPack = await fiscalReceiptAttachmentForRoomBooking(
        serviceClient(),
        bookingId,
      );
      if (receiptPack) {
        receiptAttachments = [receiptPack.attachment];
        receiptIdForMark = receiptPack.receiptId;
      }
    } catch (receiptErr) {
      const msg =
        receiptErr instanceof Error ? receiptErr.message : String(receiptErr);
      console.error("[booking-email] ricevuta:", msg);
    }
  }

  const delivery = await sendEnrollmentEmail({
    to,
    cc: ccList,
    subject: content.subject,
    text: content.text,
    html: content.html,
    preferGoogleSmtp: true,
    attachments: receiptAttachments,
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

  if (receiptIdForMark) {
    await markReceiptEmailedIfSent(
      serviceClient(),
      receiptIdForMark,
      true,
    );
  }

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
