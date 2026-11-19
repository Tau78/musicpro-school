import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

import { authPublicOrigin, safeAuthNextPath } from "@/lib/auth/redirect-url";
import { ensureAssociatoAuthForEmail } from "@/lib/auth/member-login-access";
import {
  SCHOOL_APP_URL,
  schoolEmailBodyFromText,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "@/lib/email/school-email-layout";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";

type ServiceClient = SupabaseClient<Database>;

function buildMagicLinkEmail(params: {
  loginUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Accedi a MusicPro School — link personale";
  const memberParagraphs = [
    "Ciao,",
    "",
    "ecco il link per entrare nella tua area associati (valido a uso singolo):",
    "",
    params.loginUrl,
    "",
    "Se non hai richiesto tu questo accesso, ignora questa email.",
  ].join("\n");

  const text = memberParagraphs + schoolEmailTextFooter();

  const htmlBodyParagraphs = [
    "Ciao,",
    "",
    "Usa il pulsante qui sotto per accedere alla tua area associati.",
    "Il link funziona una sola volta.",
    "",
    "Se non hai richiesto tu questo accesso, ignora questa email.",
  ].join("\n");

  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Link di accesso",
    htmlBody: schoolEmailBodyFromText(htmlBodyParagraphs),
    ctas: [{ href: params.loginUrl, label: "Entra in MusicPro School" }],
  });

  return { subject, text, html };
}

function buildMagicLinkUrl(
  origin: string,
  nextPath: string,
  data: NonNullable<
    Awaited<ReturnType<ServiceClient["auth"]["admin"]["generateLink"]>>["data"]
  >,
): string {
  const next = safeAuthNextPath(nextPath, "/dashboard");
  const hashedToken =
    data.properties?.hashed_token?.trim() ||
    (data as { properties?: { email_otp?: string } }).properties?.email_otp?.trim() ||
    "";

  if (hashedToken) {
    const params = new URLSearchParams({
      token_hash: hashedToken,
      type: "magiclink",
      next,
    });
    return `${origin}/auth/confirm?${params.toString()}`;
  }

  return data.properties?.action_link?.trim() || "";
}

export type SendMagicLinkResult =
  | { sent: true }
  | { sent: false; reason: "not_registered" | "no_link" | "smtp_failed" };

/**
 * Magic link via Resend/SMTP (come recovery), non il mailer Supabase Auth.
 */
export async function sendMagicLinkEmail(
  service: ServiceClient,
  rawEmail: string,
  nextPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendMagicLinkResult> {
  const email = rawEmail.trim().toLowerCase();
  const next = safeAuthNextPath(nextPath, "/dashboard");
  const origin = authPublicOrigin(env);
  const redirectTo = `${origin}/auth/callback?redirect=${encodeURIComponent(next)}`;

  let { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
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
        type: "magiclink",
        email,
        options: { redirectTo },
      }));
    }
  }

  if (error || !data) {
    console.warn("[magic-link] generateLink:", error?.message ?? "no data");
    return { sent: false, reason: "not_registered" };
  }

  const loginUrl = buildMagicLinkUrl(origin, next, data);
  if (!loginUrl) {
    console.error("[magic-link] missing login url/token");
    return { sent: false, reason: "no_link" };
  }

  const mail = buildMagicLinkEmail({ loginUrl });
  const sent = await sendEnrollmentEmail({
    to: [email],
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  if (!sent.sent) {
    console.error("[magic-link] send failed:", sent.error);
    return { sent: false, reason: "smtp_failed" };
  }

  return { sent: true };
}