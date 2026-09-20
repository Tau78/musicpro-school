/**
 * Email notula rimborsi: Resend se presente, altrimenti SMTP Google
 * (stesso trasporto delle iscrizioni).
 */
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";

export interface ResendAttachment {
  filename: string;
  content: string; // base64
  content_type?: string;
}

export async function sendReimbursementEmailViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: ResendAttachment[];
}): Promise<
  | { ok: true; sent: true; via?: "resend" | "smtp" }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  const result = await sendEnrollmentEmail({
    to: [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.content_type,
    })),
    timeoutMs: 20_000,
  });

  if (!result.sent) {
    return {
      ok: false,
      error:
        result.error ||
        "Nessun trasporto email (RESEND_API_KEY o GOOGLE_SMTP_*)",
    };
  }

  return { ok: true, sent: true, via: result.via };
}

export function buildNotulaEmailContent(params: {
  associateName: string;
  docLabel: string;
  pdfLink?: string | null;
}): { subject: string; html: string; text: string } {
  const firstName = params.associateName.trim().split(/\s+/)[0] || "Associato";
  const subject = `Generazione Rimborso: ${params.docLabel}`;
  const linkLine = params.pdfLink
    ? `\nPuoi anche aprire il documento originale:\n${params.pdfLink}\n`
    : "";
  const text = [
    `Ciao ${firstName},`,
    "",
    "in allegato trovi il rimborso appena generato.",
    linkLine,
    "Saluti.",
    "MusicPro School",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const htmlLink = params.pdfLink
    ? `<p>Puoi anche aprire il <a href="${escapeHtml(params.pdfLink)}">documento originale</a>.</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <p>Ciao <strong>${escapeHtml(firstName)}</strong>,</p>
  <p>in allegato trovi il rimborso appena generato.</p>
  ${htmlLink}
  <p style="margin-top:32px;font-size:12px;color:#888;">MusicPro School</p>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
