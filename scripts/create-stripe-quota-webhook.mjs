#!/usr/bin/env node
/**
 * Crea endpoint webhook Stripe per quota associativa e multi-pay.
 * Uso: node scripts/create-stripe-quota-webhook.mjs [webhook-url]
 *
 * Default: Supabase Edge `stripe-quota-webhook`
 * Flow supportati: quota_associativa, quota_multi_pay
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EDGE_URL =
  "https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-quota-webhook";

const envPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../musicpro/.env",
);

function loadEnv(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    map.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
  }
  return map;
}

const env = loadEnv(envPath);
const mode = (env.get("STRIPE_MODE") || "test").toLowerCase();
const secret =
  mode === "live"
    ? env.get("STRIPE_SECRET_KEY_LIVE") || env.get("STRIPE_SECRET_KEY")
    : env.get("STRIPE_SECRET_KEY_TEST") || env.get("STRIPE_SECRET_KEY");

if (!secret) {
  console.error("Manca STRIPE_SECRET_KEY_TEST/LIVE in musicpro/.env");
  process.exit(1);
}

const args = process.argv.slice(2);
const webhookUrlArg = args.find((a) => !a.startsWith("--"));

function resolveWebhookUrl() {
  if (webhookUrlArg) return webhookUrlArg;
  const supabaseUrl =
    env.get("NEXT_PUBLIC_SUPABASE_URL") || env.get("SUPABASE_URL");
  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-quota-webhook`;
  }
  return DEFAULT_EDGE_URL;
}

const webhookUrl = resolveWebhookUrl();

const events = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
];

const body = new URLSearchParams({
  url: webhookUrl,
  description:
    "MusicPro School — quota associativa + multi-pay (quota_associativa | quota_multi_pay)",
  "metadata[mp_product]": "musicpro-school-quota",
  "metadata[mp_flows]": "quota_associativa,quota_multi_pay",
});
for (const event of events) {
  body.append("enabled_events[]", event);
}

const resp = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
});

const data = await resp.json();
if (!resp.ok) {
  console.error("Stripe error:", data.error?.message || resp.status);
  process.exit(1);
}

console.log("Webhook creato:");
console.log("  id:", data.id);
console.log("  url:", data.url);
console.log("  secret:", data.secret);
console.log("");
console.log("Aggiungi il signing secret:");
console.log(
  `  Supabase Edge (stripe-quota-webhook): STRIPE_QUOTA_WEBHOOK_SECRET=${data.secret}`,
);
