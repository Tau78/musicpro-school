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

/** Email magic link: sostituisce l'allegato notula quando «Fai firmare digitalmente». */
export function buildDigitalSignEmailContent(params: {
  associateName: string;
  docLabel: string;
  signLink: string;
}): { subject: string; html: string; text: string } {
  const firstName = params.associateName.trim().split(/\s+/)[0] || "Associato";
  const subject = `Firma rimborso spese: ${params.docLabel}`;
  const text =
    [
      `Ciao ${firstName},`,
      "",
      "accedi al link qui sotto per firmare il rimborso spese.",
      params.signLink,
      "",
      "Saluti.",
    ].join("\n") + schoolEmailTextFooter({ showAppDownload: true });

  const htmlBody = `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">Ciao <strong>${escapeEmailHtml(firstName)}</strong>,</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">accedi al link qui sotto per firmare il rimborso spese.</p>`;

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Firma rimborso spese",
    preheader: params.docLabel,
    htmlBody,
    ctas: [{ href: params.signLink, label: "Firma il rimborso" }],
    showAppDownload: true,
  });

  return { subject, html, text };
}

/** Notifica segreteria dopo firma digitale. */
export function buildSignedNotulaSegreteriaEmailContent(params: {
  associateName: string;
  docLabel: string;
  pdfLink?: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `Rimborso firmato: ${params.docLabel}`;
  const linkLine = params.pdfLink
    ? `\nDocumento:\n${params.pdfLink}\n`
    : "";
  const text =
    [
      "Segreteria,",
      "",
      `${params.associateName} ha firmato digitalmente il rimborso ${params.docLabel}.`,
      "In allegato il PDF firmato.",
      linkLine,
    ]
      .filter((line) => line !== "")
      .join("\n") + schoolEmailTextFooter({ showAppDownload: false });

  const htmlBody = `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;"><strong>${escapeEmailHtml(params.associateName)}</strong> ha firmato digitalmente il rimborso <strong>${escapeEmailHtml(params.docLabel)}</strong>.</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">In allegato il PDF firmato.</p>`;

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Rimborso firmato",
    preheader: params.docLabel,
    htmlBody,
    ctas: params.pdfLink?.trim()
      ? [{ href: params.pdfLink.trim(), label: "Apri documento" }]
      : undefined,
    showAppDownload: false,
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
