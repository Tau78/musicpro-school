import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { ensureAssociatoAuthForEmail } from "@/lib/auth/member-login-access";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";

type ServiceClient = SupabaseClient<Database>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRecoveryEmail(params: {
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Reimposta la password — MusicPro School";
  const text = [
    "Ciao,",
    "",
    "per scegliere la password del tuo account usa il link qui sotto.",
    "",
    params.resetUrl,
    "",
    "Il link è valido per circa un'ora e si può usare una sola volta.",
    "Se non hai richiesto tu il reset, ignora questa email.",
    "",
    "— MusicPro School",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px 28px;border:1px solid #e5e7eb;">
          <tr>
            <td style="font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#0b3d5c;font-weight:700;">
              MusicPro School
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;font-size:22px;line-height:1.3;font-weight:700;color:#0b3d5c;">
              Imposta la password
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px;font-size:15px;line-height:1.55;color:#374151;">
              Ciao,<br /><br />
              per scegliere la password del tuo account usa il pulsante qui sotto.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 0 8px;">
              <a
                href="${escapeHtml(params.resetUrl)}"
                style="display:inline-block;background:#0b3d5c;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;"
              >
                Imposta password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;font-size:13px;line-height:1.5;color:#6b7280;">
              Il link è valido per circa un'ora e si può usare una sola volta.
              Se non hai richiesto tu il reset, ignora questa email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function buildResetUrl(
  origin: string,
  data: NonNullable<
    Awaited<ReturnType<ServiceClient["auth"]["admin"]["generateLink"]>>["data"]
  >,
): string {
  const hashedToken =
    data.properties?.hashed_token?.trim() ||
    (data as { properties?: { email_otp?: string } }).properties?.email_otp?.trim() ||
    "";

  if (hashedToken) {
    return `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=${encodeURIComponent("/reset-password")}`;
  }

  return data.properties?.action_link?.trim() || "";
}

export type SendPasswordRecoveryResult =
  | { sent: true }
  | { sent: false; reason: "not_registered" | "no_link" | "smtp_failed" };

/**
 * Invia email recovery. Se Auth manca ma l'email è in anagrafica associati, crea Auth prima.
 */
export async function sendPasswordRecoveryEmail(
  service: ServiceClient,
  rawEmail: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendPasswordRecoveryResult> {
  const email = rawEmail.trim().toLowerCase();
  const origin = authPublicOrigin(env);
  const redirectTo = `${origin}/auth/callback?redirect=${encodeURIComponent("/reset-password")}`;

  let { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  const userMissing =
    error?.message?.toLowerCase().includes("not found") ||
    error?.message?.toLowerCase().includes("user with this email");

  if ((error || !data) && userMissing) {
    const ensured = await ensureAssociatoAuthForEmail(service, email);
    if (ensured) {
      ({ data, error } = await service.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      }));
    }
  }

  if (error || !data) {
    console.warn("[forgot-password] generateLink:", error?.message ?? "no data");
    return { sent: false, reason: "not_registered" };
  }

  const resetUrl = buildResetUrl(origin, data);
  if (!resetUrl) {
    console.error("[forgot-password] missing reset url/token");
    return { sent: false, reason: "no_link" };
  }

  const mail = buildRecoveryEmail({ resetUrl });
  const sent = await sendEnrollmentEmail({
    to: [email],
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    preferGoogleSmtp: true,
  });

  if (!sent.sent) {
    console.error("[forgot-password] send failed:", sent.error);
    return { sent: false, reason: "smtp_failed" };
  }

  return { sent: true };
}
