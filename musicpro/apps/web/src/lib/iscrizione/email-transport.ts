/**
 * Trasporto email iscrizione: Resend se presente, altrimenti SMTP Google Workspace
 * (stesso stack di APP Eventi: mauro@www.musicproeventi.it).
 */
import nodemailer from "nodemailer";

export function googleSmtpConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SMTP_USER?.trim() &&
      process.env.GOOGLE_SMTP_APP_PASSWORD?.trim(),
  );
}

export function enrollmentFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    process.env.GOOGLE_SMTP_FROM?.trim() ||
    (process.env.GOOGLE_SMTP_USER?.trim()
      ? `MusicPro School <${process.env.GOOGLE_SMTP_USER.trim()}>`
      : "MusicPro School <noreply@school.musicproeventi.it>")
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r\n|\r|\n/g, "<br />");
}

export type EnrollmentAttachment = {
  filename: string;
  /** base64 (Resend) */
  content: string;
  content_type?: string;
};

async function sendViaResend(params: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EnrollmentAttachment[];
  timeoutMs: number;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY assente" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: enrollmentFromAddress(),
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html || escapeHtml(params.text),
        attachments: params.attachments?.length
          ? params.attachments
          : undefined,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        sent: false,
        error: `Resend HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaGoogleSmtp(params: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EnrollmentAttachment[];
}): Promise<{ sent: boolean; error?: string }> {
  if (!googleSmtpConfigured()) {
    return {
      sent: false,
      error: "GOOGLE_SMTP_USER/APP_PASSWORD assenti",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.GOOGLE_SMTP_USER!.trim(),
        pass: process.env.GOOGLE_SMTP_APP_PASSWORD!.trim(),
      },
    });

    await transporter.sendMail({
      from: enrollmentFromAddress(),
      to: params.to.join(", "),
      subject: params.subject,
      text: params.text,
      html: params.html || escapeHtml(params.text),
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        contentType: a.content_type || "application/octet-stream",
      })),
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[iscrizione] Google SMTP:", message);
    return { sent: false, error: `SMTP: ${message}` };
  }
}

/** Resend se configurato, altrimenti SMTP Google (APP Eventi). */
export async function sendEnrollmentEmail(params: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EnrollmentAttachment[];
  timeoutMs?: number;
}): Promise<{ sent: boolean; error?: string; via?: "resend" | "smtp" }> {
  if (!params.to.length) {
    return { sent: false, error: "Nessun destinatario" };
  }

  const timeoutMs = params.timeoutMs ?? 8000;
  if (process.env.RESEND_API_KEY?.trim()) {
    const resend = await sendViaResend({ ...params, timeoutMs });
    if (resend.sent) return { ...resend, via: "resend" };
    // Se Resend fallisce ma SMTP c’è, prova fallback.
    if (googleSmtpConfigured()) {
      const smtp = await sendViaGoogleSmtp(params);
      if (smtp.sent) return { ...smtp, via: "smtp" };
      return {
        sent: false,
        error: `${resend.error || "Resend fail"}; ${smtp.error || "SMTP fail"}`,
      };
    }
    return resend;
  }

  if (googleSmtpConfigured()) {
    const smtp = await sendViaGoogleSmtp(params);
    return smtp.sent ? { ...smtp, via: "smtp" } : smtp;
  }

  return {
    sent: false,
    error: "Nessun trasporto email (RESEND_API_KEY o GOOGLE_SMTP_*)",
  };
}
