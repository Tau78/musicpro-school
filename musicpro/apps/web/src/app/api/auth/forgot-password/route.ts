import { NextResponse } from "next/server";

import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  email?: string;
}

const GENERIC_OK =
  "Se l'indirizzo è registrato, riceverai a breve un'email con il link per impostare la password.";

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

/**
 * Reset password via Google SMTP (stesso trasporto delle prenotazioni),
 * invece del mailer Auth Supabase — più affidabile in produzione.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { success: false, message: "Inserisci un'email valida." },
      { status: 400 },
    );
  }

  // Risposta generica anche se manca l'account (anti enumeration).
  const ok = () =>
    NextResponse.json({ success: true, message: GENERIC_OK });

  try {
    const service = createServiceRoleClient();
    const origin = authPublicOrigin(process.env);
    const redirectTo = `${origin}/auth/callback?redirect=${encodeURIComponent("/reset-password")}`;

    const { data, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error || !data) {
      console.warn("[forgot-password] generateLink:", error?.message ?? "no data");
      return ok();
    }

    const hashedToken =
      data.properties?.hashed_token?.trim() ||
      (data as { properties?: { email_otp?: string } }).properties?.email_otp?.trim() ||
      "";

    const resetUrl = hashedToken
      ? `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=${encodeURIComponent("/reset-password")}`
      : data.properties?.action_link?.trim() || "";

    if (!resetUrl) {
      console.error("[forgot-password] missing reset url/token");
      return ok();
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
      return NextResponse.json(
        {
          success: false,
          message:
            "Impossibile inviare l'email di reset in questo momento. Riprova tra poco o contatta la segreteria.",
        },
        { status: 502 },
      );
    }

    return ok();
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json(
      {
        success: false,
        message:
          "Impossibile inviare l'email di reset in questo momento. Riprova tra poco.",
      },
      { status: 500 },
    );
  }
}
