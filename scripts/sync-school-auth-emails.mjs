#!/usr/bin/env node
/**
 * Allinea i template email Auth (recovery + magic link) sul progetto cloud.
 * Usa TokenHash → /auth/confirm (niente ConfirmationURL Supabase / PKCE cross-browser).
 *
 *   node scripts/sync-school-auth-emails.mjs           # apply
 *   node scripts/sync-school-auth-emails.mjs --check   # solo verifica
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "mlsiagbrejjylqvcnfbe";
const CHECK_ONLY = process.argv.includes("--check");

const SUBJECTS = {
  recovery: "Reimposta la password — MusicPro School",
  magic_link: "Link di accesso — MusicPro School",
};

const TEMPLATES = {
  recovery: path.join(ROOT, "supabase/templates/recovery.html"),
  magic_link: path.join(ROOT, "supabase/templates/magic_link.html"),
};

function decodeKeyringToken(raw) {
  const prefix = "go-keyring-base64:";
  if (!raw.startsWith(prefix)) return raw;
  return Buffer.from(raw.slice(prefix.length), "base64").toString("utf8");
}

function loadAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN;
  }
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
      { encoding: "utf8" },
    ).trim();
    return decodeKeyringToken(raw);
  } catch {
    return "";
  }
}

async function authConfig(method, token, body) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SupabaseCLI/2.115.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

function loadTemplate(filePath) {
  return readFileSync(filePath, "utf8").trim();
}

function assertTemplateShape(name, html) {
  if (!html.includes("{{ .TokenHash }}")) {
    fail(`${name}: manca {{ .TokenHash }}`);
    return false;
  }
  if (!html.includes("/auth/confirm")) {
    fail(`${name}: manca /auth/confirm`);
    return false;
  }
  if (html.includes("{{ .ConfirmationURL }}")) {
    fail(`${name}: non usare ConfirmationURL (PKCE / prefetch)`);
    return false;
  }
  // Niente URL grezzi lunghi sotto il bottone
  if (/supabase\.co\/auth\/v1\/verify/i.test(html)) {
    fail(`${name}: non includere URL verify grezzi`);
    return false;
  }
  return true;
}

function templatesMatch(current, expectedHtml, expectedSubject, kind) {
  const contentKey =
    kind === "recovery"
      ? "mailer_templates_recovery_content"
      : "mailer_templates_magic_link_content";
  const subjectKey =
    kind === "recovery"
      ? "mailer_subjects_recovery"
      : "mailer_subjects_magic_link";

  const content = String(current[contentKey] || "").trim();
  const subject = String(current[subjectKey] || "").trim();
  return content === expectedHtml && subject === expectedSubject;
}

async function main() {
  const token = loadAccessToken();
  if (!token) {
    fail("Manca SUPABASE_ACCESS_TOKEN (o login CLI Supabase)");
    return;
  }

  const recoveryHtml = loadTemplate(TEMPLATES.recovery);
  const magicHtml = loadTemplate(TEMPLATES.magic_link);

  if (!assertTemplateShape("recovery", recoveryHtml)) return;
  if (!assertTemplateShape("magic_link", magicHtml)) return;

  const current = await authConfig("GET", token);
  const recoveryOk = templatesMatch(
    current,
    recoveryHtml,
    SUBJECTS.recovery,
    "recovery",
  );
  const magicOk = templatesMatch(
    current,
    magicHtml,
    SUBJECTS.magic_link,
    "magic_link",
  );

  if (recoveryOk && magicOk) {
    ok("Template recovery + magic link già allineati");
    return;
  }

  if (CHECK_ONLY) {
    if (!recoveryOk) fail("Template recovery non allineato");
    if (!magicOk) fail("Template magic link non allineato");
    fail("Lancia senza --check per aggiornare i template Auth.");
    return;
  }

  await authConfig("PATCH", token, {
    mailer_subjects_recovery: SUBJECTS.recovery,
    mailer_templates_recovery_content: recoveryHtml,
    mailer_subjects_magic_link: SUBJECTS.magic_link,
    mailer_templates_magic_link_content: magicHtml,
  });

  const after = await authConfig("GET", token);
  if (
    !templatesMatch(after, recoveryHtml, SUBJECTS.recovery, "recovery") ||
    !templatesMatch(after, magicHtml, SUBJECTS.magic_link, "magic_link")
  ) {
    fail("PATCH eseguito ma i template non corrispondono al file locale");
    return;
  }

  ok("Template recovery aggiornato");
  ok("Template magic link aggiornato");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
