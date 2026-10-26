import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { ensureAssociatoAuthForEmail } from "@/lib/auth/member-login-access";
import {
  SCHOOL_APP_URL,
  schoolEmailBodyFromText,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "@/lib/email/school-email-layout";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";

type ServiceClient = SupabaseClient<Database>;

function buildRecoveryEmail(params: {
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Reimposta la password — MusicPro School";
  const memberParagraphs = [
    "Ciao,",
    "",
    "per scegliere la password del tuo account usa il link qui sotto.",
    "",
    params.resetUrl,
    "",
    "Il link è valido per circa un'ora e si può usare una sola volta.",
    "Se non hai richiesto tu il reset, ignora questa email.",
  ].join("\n");

  const text = memberParagraphs + schoolEmailTextFooter();

  const htmlBodyParagraphs = [
    "Ciao,",
    "",
    "per scegliere la password del tuo account usa il pulsante qui sotto.",
    "",
    "Il link è valido per circa un'ora e si può usare una sola volta.",
    "Se non hai richiesto tu il reset, ignora questa email.",
  ].join("\n");

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Reimposta la password",
    htmlBody: schoolEmailBodyFromText(htmlBodyParagraphs),
    ctas: [{ href: params.resetUrl, label: "Imposta password" }],
  });

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
    // Auth: Resend first (non consuma quota Gmail Workspace), poi SMTP.
  });

  if (!sent.sent) {
    console.error("[forgot-password] send failed:", sent.error);
    return { sent: false, reason: "smtp_failed" };
  }

  return { sent: true };
}
