/**
 * SMTP Google Workspace — pattern APP Eventi (`supabase/functions/_shared/google-workspace-smtp.ts`)
 * con supporto OAuth2 (refresh token) oltre ad App Password.
 */
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { OAuth2Client } from "google-auth-library";


type SmtpCreds = { user: string; pass: string };

function stripPass(raw: string): string {
  return raw.replace(/\s+/g, "").trim() || raw.trim();
}

export function googleSmtpOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SMTP_USER?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      (process.env.GOOGLE_SMTP_REFRESH_TOKEN?.trim() ||
        process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim()),
  );
}

export function googleSmtpAppPasswordConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SMTP_USER?.trim() &&
      process.env.GOOGLE_SMTP_APP_PASSWORD?.trim(),
  );
}

/** OAuth preferito; fallback App Password (come Edge Eventi). */
export function googleSmtpConfigured(): boolean {
  return googleSmtpOAuthConfigured() || googleSmtpAppPasswordConfigured();
}

function workspaceAppPasswordCreds(): SmtpCreds {
  return {
    user: (process.env.GOOGLE_SMTP_USER ?? "").trim(),
    pass: (process.env.GOOGLE_SMTP_APP_PASSWORD ?? "").trim(),
  };
}

function refreshToken(): string {
  return (
    process.env.GOOGLE_SMTP_REFRESH_TOKEN?.trim() ||
    process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim() ||
    ""
  );
}

let oauthClient: OAuth2Client | null = null;

function getOAuth2Client(): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
      process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
    );
    oauthClient.setCredentials({ refresh_token: refreshToken() });
  }
  return oauthClient;
}

async function oauth2AccessToken(): Promise<string> {
  const client = getOAuth2Client();
  const res = await client.getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  if (!token?.trim()) {
    throw new Error("Token OAuth Gmail assente (refresh token scaduto/revocato?)");
  }
  return token.trim();
}

const pooled = new Map<string, { transporter: nodemailer.Transporter; authKey: string }>();

function smtpAuthFingerprint(mode: "oauth" | "password", creds?: SmtpCreds): string {
  if (mode === "oauth") {
    return `oauth\0${process.env.GOOGLE_SMTP_USER}\0${refreshToken().length}`;
  }
  const c = creds ?? workspaceAppPasswordCreds();
  return `password\0${c.user}\0${stripPass(c.pass).length}`;
}

async function buildTransporter(): Promise<{
  transporter: nodemailer.Transporter;
  mode: "oauth" | "password";
  authKey: string;
}> {
  if (googleSmtpOAuthConfigured()) {
    const authKey = smtpAuthFingerprint("oauth");
    const existing = pooled.get("oauth");
    if (existing && existing.authKey === authKey) {
      return { transporter: existing.transporter, mode: "oauth", authKey };
    }
    const user = process.env.GOOGLE_SMTP_USER!.trim();
    const accessToken = await oauth2AccessToken();
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      pool: true,
      maxConnections: 1,
      auth: {
        type: "OAuth2",
        user,
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
        refreshToken: refreshToken(),
        accessToken,
      },
    });
    pooled.set("oauth", { transporter, authKey });
    return { transporter, mode: "oauth", authKey };
  }

  const creds = workspaceAppPasswordCreds();
  if (!googleSmtpAppPasswordConfigured()) {
    throw new Error("SMTP non configurato (OAuth o GOOGLE_SMTP_APP_PASSWORD)");
  }
  const authKey = smtpAuthFingerprint("password", creds);
  const existing = pooled.get("password");
  if (existing && existing.authKey === authKey) {
    return { transporter: existing.transporter, mode: "password", authKey };
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    pool: true,
    maxConnections: 1,
    auth: {
      user: creds.user,
      pass: stripPass(creds.pass) || creds.pass,
    },
  });
  pooled.set("password", { transporter, authKey });
  return { transporter, mode: "password", authKey };
}

export type GoogleSmtpMail = {
  from: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Mail.Attachment[];
};

export async function sendGoogleWorkspaceSmtpMail(
  mail: GoogleSmtpMail,
): Promise<{ via: "oauth" | "password" }> {
  const { transporter, mode } = await buildTransporter();
  try {
    await transporter.sendMail({
      from: mail.from,
      to: mail.to,
      cc: mail.cc,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
    });
    return { via: mode };
  } catch (err) {
    if (mode === "oauth") {
      pooled.delete("oauth");
      oauthClient = null;
    } else {
      pooled.delete("password");
    }
    throw err;
  }
}

export async function verifyGoogleWorkspaceSmtp(): Promise<{
  ok: boolean;
  mode?: "oauth" | "password";
  error?: string;
}> {
  if (!googleSmtpConfigured()) {
    return { ok: false, error: "SMTP non configurato" };
  }
  try {
    const { transporter, mode } = await buildTransporter();
    await transporter.verify();
    return { ok: true, mode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function closeGoogleWorkspaceSmtpPool(): void {
  for (const [key, entry] of pooled) {
    try {
      entry.transporter.close();
    } catch {
      // ignore
    }
    pooled.delete(key);
  }
  oauthClient = null;
}