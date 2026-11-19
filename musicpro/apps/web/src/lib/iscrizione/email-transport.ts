/**
 * Trasporto email iscrizione: Resend se presente, altrimenti SMTP Google Workspace
 * (stesso stack di APP Eventi + OAuth2 quando configurato).
 */
import nodemailer from "nodemailer";

import {
  closeGoogleWorkspaceSmtpPool,
  googleSmtpAppPasswordConfigured,
  googleSmtpConfigured,
  googleSmtpOAuthConfigured,
  sendGoogleWorkspaceSmtpMail,
} from "./google-workspace-smtp";

export {
  googleSmtpConfigured,
  googleSmtpOAuthConfigured,
  googleSmtpAppPasswordConfigured,
  closeGoogleWorkspaceSmtpPool,
} from "./google-workspace-smtp";

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
  cc?: string[];
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
        cc: params.cc?.length ? params.cc : undefined,
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
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EnrollmentAttachment[];
}): Promise<{ sent: boolean; error?: string; smtpMode?: "oauth" | "password" }> {
  if (!googleSmtpConfigured()) {
    return {
      sent: false,
      error: "GOOGLE_SMTP_* (OAuth o App Password) assenti",
    };
  }

  try {
    const { via } = await sendGoogleWorkspaceSmtpMail({
      from: enrollmentFromAddress(),
      to: params.to,
      cc: params.cc?.length ? params.cc : undefined,
      subject: params.subject,
      text: params.text,
      html: params.html || escapeHtml(params.text),
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        contentType: a.content_type || "application/octet-stream",
      })),
    });
    return { sent: true, smtpMode: via };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[iscrizione] Google SMTP:", message);
    return { sent: false, error: `SMTP: ${message}` };
  }
}

/** Resend se configurato, altrimenti SMTP Google (APP Eventi). */
export async function sendEnrollmentEmail(params: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EnrollmentAttachment[];
  timeoutMs?: number;
  /**
   * Prenotazioni sale: solo Google SMTP (Resend è post-V1).
   * Auth / recupero password: omettere → Resend (se RESEND_API_KEY) poi Google.
   */
  preferGoogleSmtp?: boolean;
}): Promise<{
  sent: boolean;
  error?: string;
  via?: "resend" | "smtp";
  smtpMode?: "oauth" | "password";
}> {
  if (!params.to.length) {
    return { sent: false, error: "Nessun destinatario" };
  }

  const timeoutMs = params.timeoutMs ?? 8000;
  if (params.preferGoogleSmtp && googleSmtpConfigured()) {
    const smtp = await sendViaGoogleSmtp(params);
    return smtp.sent
      ? { ...smtp, via: "smtp", smtpMode: smtp.smtpMode }
      : smtp;
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    const resend = await sendViaResend({ ...params, timeoutMs });
    if (resend.sent) return { ...resend, via: "resend" };
    if (googleSmtpConfigured()) {
      const smtp = await sendViaGoogleSmtp(params);
      if (smtp.sent) {
        return { ...smtp, via: "smtp", smtpMode: smtp.smtpMode };
      }
      return {
        sent: false,
        error: `${resend.error || "Resend fail"}; ${smtp.error || "SMTP fail"}`,
      };
    }
    return resend;
  }

  if (googleSmtpConfigured()) {
    const smtp = await sendViaGoogleSmtp(params);
    return smtp.sent
      ? { ...smtp, via: "smtp", smtpMode: smtp.smtpMode }
      : smtp;
  }

  return {
    sent: false,
    error: "Nessun trasporto email (RESEND_API_KEY o GOOGLE_SMTP_*)",
  };
}

/** Connessione SMTP riutilizzabile per invii massivi (pool). */
export function createGoogleSmtpTransport() {
  if (!googleSmtpAppPasswordConfigured()) return null;
  const creds = {
    user: process.env.GOOGLE_SMTP_USER!.trim(),
    pass: process.env.GOOGLE_SMTP_APP_PASSWORD!.trim().replace(/\s+/g, ""),
  };
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    pool: true,
    maxConnections: 1,
    auth: creds,
  });
}