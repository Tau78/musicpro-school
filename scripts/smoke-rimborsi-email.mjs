#!/usr/bin/env node
/**
 * Smoke: flag INVIA EMAIL notula rimborsi + trasporto Resend/SMTP.
 *
 * Usage:
 *   node scripts/smoke-rimborsi-email.mjs
 *   node scripts/smoke-rimborsi-email.mjs --live   # invia email di prova a GOOGLE_SMTP_USER / RESEND test
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const live = process.argv.includes("--live");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function sourceMustInclude(relPath, snippets) {
  const abs = path.join(rootDir, relPath);
  const src = readFileSync(abs, "utf8");
  for (const snippet of snippets) {
    if (!src.includes(snippet)) {
      fail(`${relPath} manca «${snippet}»`);
    }
  }
  if (!process.exitCode) ok(`${relPath} contratto presente`);
}

function mainContracts() {
  sourceMustInclude(
    "musicpro/apps/web/src/components/admin/reimbursements-panel.tsx",
    [
      "sendEmail: true",
      "if (input.sendEmail)",
      "/api/admin/reimbursements/${encodeURIComponent(id)}/email",
      "Invia email notula",
      "listRecentReimbursementAssociates",
      "Recenti",
      "recentAssociates",
    ],
  );
  sourceMustInclude("musicpro/apps/web/src/lib/reimbursements/send.ts", [
    "sendReimbursementNotulaEmail",
    "sendReimbursementEmailViaResend",
    "persistReimbursementPdf",
    "skipped: true",
  ]);
  sourceMustInclude("musicpro/apps/web/src/lib/reimbursements/email.ts", [
    "sendEnrollmentEmail",
    "buildNotulaEmailContent",
    "Generazione Rimborso:",
  ]);
  sourceMustInclude(
    "musicpro/apps/web/src/app/api/admin/reimbursements/[id]/email/route.ts",
    ["sendReimbursementNotulaEmail", "POST"],
  );
  sourceMustInclude("musicpro/packages/database/src/reimbursements.ts", [
    "listRecentReimbursementAssociates",
    "limit(200)",
  ]);
}

async function transportSmoke() {
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, "musicpro/.env"));
  loadEnvFile(path.join(rootDir, "musicpro/apps/web/.env.local"));

  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSmtp = Boolean(
    process.env.GOOGLE_SMTP_USER?.trim() &&
      process.env.GOOGLE_SMTP_APP_PASSWORD?.trim(),
  );
  if (!hasResend && !hasSmtp) {
    fail("Nessun trasporto: manca RESEND_API_KEY e GOOGLE_SMTP_*");
    return;
  }
  ok(
    `trasporto disponibile: ${[
      hasResend ? "Resend" : null,
      hasSmtp ? "SMTP" : null,
    ]
      .filter(Boolean)
      .join(" + ")}`,
  );

  // Content builder (no network)
  const emailModPath = path.join(
    rootDir,
    "musicpro/apps/web/src/lib/reimbursements/email.ts",
  );
  // Can't easily import TS; inline check of buildNotulaEmailContent contract via source
  const emailSrc = readFileSync(emailModPath, "utf8");
  if (!emailSrc.includes("in allegato trovi il rimborso appena generato")) {
    fail("template email notula incompleto");
  } else {
    ok("template email notula");
  }

  if (!live) {
    ok("skip invio live (passa --live per prova SMTP/Resend)");
    return;
  }

  // Live: use enrollment transport via dynamic import of compiled path is hard;
  // call nodemailer verify + sendEnrollmentEmail through a small inline SMTP test.
  const require = createRequire(
    path.join(rootDir, "musicpro/apps/web/package.json"),
  );
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    try {
      nodemailer = require(path.join(
        rootDir,
        "musicpro/node_modules/nodemailer",
      ));
    } catch (err) {
      fail(`nodemailer non trovato: ${err instanceof Error ? err.message : err}`);
      return;
    }
  }

  if (hasSmtp) {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.GOOGLE_SMTP_USER.trim(),
        pass: process.env.GOOGLE_SMTP_APP_PASSWORD.trim(),
      },
    });
    try {
      await transporter.verify();
      ok("SMTP verify OK");
    } catch (err) {
      fail(`SMTP verify: ${err instanceof Error ? err.message : err}`);
      return;
    }

    const to = process.env.GOOGLE_SMTP_USER.trim();
    const from =
      process.env.GOOGLE_SMTP_FROM?.trim() ||
      process.env.EMAIL_FROM?.trim() ||
      `MusicPro School <${to}>`;
    try {
      await transporter.sendMail({
        from,
        to,
        subject: "[smoke] Notula rimborsi — INVIA EMAIL",
        text: "Smoke MusicPro School: trasporto email notula OK. Puoi ignorare.",
        html: "<p>Smoke MusicPro School: trasporto email notula <strong>OK</strong>.</p>",
      });
      ok(`SMTP live inviata a ${to}`);
    } catch (err) {
      fail(`SMTP send: ${err instanceof Error ? err.message : err}`);
    }
  } else if (hasResend) {
    const from =
      process.env.REIMBURSEMENT_EMAIL_FROM?.trim() ||
      process.env.BOOKING_EMAIL_FROM?.trim() ||
      process.env.EMAIL_FROM?.trim() ||
      "MusicPro School <noreply@school.musicproeventi.it>";
    const to =
      process.env.SMOKE_EMAIL_TO?.trim() ||
      process.env.GOOGLE_SMTP_USER?.trim();
    if (!to) {
      fail("Resend live: imposta SMOKE_EMAIL_TO");
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "[smoke] Notula rimborsi — INVIA EMAIL",
        text: "Smoke MusicPro School: Resend notula OK.",
      }),
    });
    if (!res.ok) {
      fail(`Resend live ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } else {
      ok(`Resend live inviata a ${to}`);
    }
  }
}

async function recentAssociatesSmoke() {
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, "musicpro/.env"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    ok("skip query ultimi associati (no supabase env)");
    return;
  }
  const require = createRequire(
    path.join(rootDir, "musicpro/package.json"),
  );
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("reimbursements")
    .select("member_id, generated_at")
    .order("generated_at", { ascending: false })
    .limit(200);
  if (error) {
    fail(`query recenti: ${error.message}`);
    return;
  }
  const seen = new Set();
  const ids = [];
  for (const row of data ?? []) {
    if (!row.member_id || seen.has(row.member_id)) continue;
    seen.add(row.member_id);
    ids.push(row.member_id);
    if (ids.length >= 10) break;
  }
  ok(`ultimi associati unici: ${ids.length}`);
}

mainContracts();
await recentAssociatesSmoke();
await transportSmoke();

if (process.exitCode) {
  console.error("\nSmoke rimborsi email: FAILED");
} else {
  console.log("\nSmoke rimborsi email: PASSED");
}
