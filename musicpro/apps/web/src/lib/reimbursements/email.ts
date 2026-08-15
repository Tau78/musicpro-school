const DEFAULT_FROM = "MusicPro School <noreply@school.musicproeventi.it>";

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
  | { ok: true; sent: true }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: true,
      skipped: true,
      reason: "RESEND_API_KEY assente — invio email saltato (dev mode)",
    };
  }

  const from =
    process.env.REIMBURSEMENT_EMAIL_FROM?.trim() ||
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    DEFAULT_FROM;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments?.length
        ? params.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.content_type,
          }))
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Resend ${res.status}: ${body.slice(0, 500)}`,
    };
  }

  return { ok: true, sent: true };
}

export function buildNotulaEmailContent(params: {
  associateName: string;
  docLabel: string;
}): { subject: string; html: string; text: string } {
  const firstName = params.associateName.trim().split(/\s+/)[0] || "Associato";
  const subject = `Generazione Rimborso: ${params.docLabel}`;
  const text = [
    `Ciao ${firstName},`,
    "",
    "in allegato trovi il rimborso appena generato.",
    "",
    "Saluti.",
    "MusicPro School",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <p>Ciao <strong>${escapeHtml(firstName)}</strong>,</p>
  <p>in allegato trovi il rimborso appena generato.</p>
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
