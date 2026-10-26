/**
 * Email notula rimborsi: Resend se presente, altrimenti SMTP Google
 * (stesso trasporto delle iscrizioni).
 */
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";
import {
  escapeEmailHtml,
  SCHOOL_APP_URL,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "@/lib/email/school-email-layout";

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
  /** false per copie segreteria; default true per associato/docente. */
  showAppDownload?: boolean;
}): { subject: string; html: string; text: string } {
  const firstName = params.associateName.trim().split(/\s+/)[0] || "Associato";
  const subject = `Generazione Rimborso: ${params.docLabel}`;
  const showAppDownload = params.showAppDownload !== false;
  const linkLine = params.pdfLink
    ? `\nPuoi anche aprire il documento originale:\n${params.pdfLink}\n`
    : "";
  const text = [
    `Ciao ${firstName},`,
    "",
    "in allegato trovi il rimborso appena generato.",
    linkLine,
    "Saluti.",
  ]
    .filter((line) => line !== "")
    .join("\n") + schoolEmailTextFooter({ showAppDownload });

  const htmlBody = `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">Ciao <strong>${escapeEmailHtml(firstName)}</strong>,</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">in allegato trovi il rimborso appena generato.</p>`;

  const ctas =
    params.pdfLink?.trim()
      ? [
          {
            href: params.pdfLink.trim(),
            label: "Apri documento originale",
          },
        ]
      : undefined;

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Rimborso generato",
    preheader: params.docLabel,
    htmlBody,
    ctas,
    showAppDownload,
  });

  return { subject, html, text };
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
