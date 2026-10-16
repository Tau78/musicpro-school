#!/usr/bin/env node
/**
 * Invia magic link area associati (Google SMTP o Resend).
 * Usage: node scripts/send-associate-magic-link.mjs --email a@b.it [--first-name Nome]
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { authApi, getSupabaseConfig, loadEnv } from "./lib/supabase-smoke.mjs";

const require = createRequire(import.meta.url);
const nodemailer = require(
  join(dirname(fileURLToPath(import.meta.url)), "../musicpro/node_modules/nodemailer"),
);

const args = process.argv.slice(2);
const emailArg = args.indexOf("--email");
const nameArg = args.indexOf("--first-name");
const email =
  emailArg >= 0 ? args[emailArg + 1]?.trim().toLowerCase() : "";
const firstName =
  nameArg >= 0 ? args[nameArg + 1]?.trim() : "Associato";

if (!email?.includes("@")) {
  console.error("Usage: node scripts/send-associate-magic-link.mjs --email x@y.it");
  process.exit(1);
}

const env = loadEnv();
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const origin = "https://school.musicproeventi.it";
const next = "/dashboard/impostazioni";
const redirectTo = `${origin}/auth/callback?redirect=${encodeURIComponent(next)}`;
const { supabaseUrl, serviceKey } = getSupabaseConfig(env);

const data = await authApi(supabaseUrl, serviceKey, "POST", "/auth/v1/admin/generate_link", {
  type: "magiclink",
  email,
  options: { redirect_to: redirectTo },
});

const hashedToken =
  data?.hashed_token?.trim() || data?.properties?.hashed_token?.trim() || "";
const loginUrl = hashedToken
  ? `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent(next)}`
  : data?.action_link || data?.properties?.action_link || "";

if (!loginUrl) {
  console.error("Impossibile generare il link.", JSON.stringify(data).slice(0, 400));
  process.exit(1);
}

const subject = "Accedi a MusicPro School — link personale";
const text = [
  `Ciao ${firstName},`,
  "",
  "ecco il link per entrare nella tua area associati (valido a uso singolo):",
  "",
  loginUrl,
  "",
  "Dopo l'accesso apri Impostazioni → Password per scegliere una nuova password.",
  "",
  "— MusicPro School",
].join("\n");

const html = `<!DOCTYPE html><html lang="it"><body style="font-family:-apple-system,sans-serif;line-height:1.5;padding:24px;">
<p>Ciao ${firstName},</p>
<p>Link per la tua <strong>area associati</strong>:</p>
<p><a href="${loginUrl.replace(/"/g, "&quot;")}" style="display:inline-block;background:#0b3d5c;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Entra in MusicPro School</a></p>
<p style="font-size:14px;color:#4b5563;">Poi in <strong>Impostazioni → Password</strong> imposta una nuova password.</p>
</body></html>`;

async function sendResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, error: "no_resend" };
  const from =
    process.env.EMAIL_FROM?.trim() ||
    "MusicPro School <noreply@school.musicproeventi.it>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [email], subject, text, html }),
  });
  if (!res.ok) {
    return { sent: false, error: await res.text() };
  }
  return { sent: true, via: "resend" };
}

async function sendGoogle() {
  const user = process.env.GOOGLE_SMTP_USER?.trim();
  const pass = process.env.GOOGLE_SMTP_APP_PASSWORD?.trim();
  if (!user || !pass) return { sent: false, error: "no_smtp" };
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
  const from =
    process.env.EMAIL_FROM?.trim() ||
    process.env.GOOGLE_SMTP_FROM?.trim() ||
    `MusicPro School <${user}>`;
  try {
    const info = await transporter.sendMail({ from, to: email, subject, text, html });
    return { sent: true, via: "google", messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}

let result = await sendResend();
if (!result.sent) {
  result = await sendGoogle();
}

if (result.sent) {
  console.log(JSON.stringify({ ok: true, to: email, ...result }, null, 2));
  process.exit(0);
}

console.error(
  JSON.stringify({ ok: false, to: email, loginUrl, error: result.error }, null, 2),
);
console.error(
  "\nEmail non inviata. Inoltra loginUrl all'associato (WhatsApp/SMS) o riprova dopo reset quota Gmail.",
);
process.exit(1);
