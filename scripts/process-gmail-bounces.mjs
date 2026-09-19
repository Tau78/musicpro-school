#!/usr/bin/env node
/**
 * Bounce Gmail → MusicPro School.
 * Legge gli NDR in INBOX (stessa casella di APP Eventi: mauro@ / notifiche@),
 * trova gli indirizzi rotti e SVUOTA solo members.email / manual_tutor_email.
 * Non cancella l'associato.
 *
 *   node scripts/process-gmail-bounces.mjs --imap
 *   node scripts/process-gmail-bounces.mjs --imap --apply
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAP_PY = path.join(__dirname, "lib/gmail-ndr-imap.py");

dotenv.config({ path: path.join(ROOT, "musicpro", ".env") });
dotenv.config({ path: path.join(ROOT, ".env") });

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
const IGNORE = [
  "mailer-daemon@",
  "postmaster@",
  "noreply@",
  "no-reply@",
  "bounce@",
  "notifiche@www.musicproeventi.it",
  "info@ilcervellone.it",
  "mauro@www.musicproeventi.it",
  "noreply@school.musicproeventi.it",
  "apple.review@",
  "appstore.review@",
  "demo.allievo.",
  "demo.docente",
  "sandbox-gestore@",
  "tuaemail@esempio.com",
  "missing+",
];
const HARD_RE =
  /5\.1\.[0-9]|5\.4\.1|user unknown|address not found|does(?: not|n't) exist|unknown user|invalid (?:recipient|mailbox|address)|recipient rejected|mailbox unavailable|no such user|indirizzo (?:non (?:esiste|valido|trovato)|inesistente)|indirizzo non trovato|inesistent|account disabled|disabled recipient|550[^\n]{0,80}5\.1|delivery status notification \(failure\)/i;
const MAILBOX_FULL_RE =
  /4\.2\.2|452\s+4\.2\.2|casella[^\n]{0,40}piena|inbox is out of storage|mailbox(?: is)? full|over quota|insufficient storage|out of storage space/i;
const DELAY_RE =
  /delivery status notification \(delay\)|consegna non completata|si è verificato un pr(?:oblema|oblema)|tenterà di inviarlo|tenterà di (?:inviarlo|consegnarlo) nuovamente|per altre \d+ ore/i;
const SOFT_RE =
  /try again later|temporarily deferred|timeout|connection timed out|greylist|resources temporarily|4\.[0-9]\.[0-9]/i;
const NDR_FROM_RE = /mailer-daemon@|postmaster@|mail delivery subsystem/i;

function classify(text) {
  // Per MusicPro anche "Consegna non completata" rende l'indirizzo inutilizzabile:
  // Gmail può ritentare, ma non deve restare nell'anagrafica né in INBOX.
  if (DELAY_RE.test(text)) return "hard";
  if (MAILBOX_FULL_RE.test(text)) return "mailbox_full";
  if (HARD_RE.test(text)) return "hard";
  if (SOFT_RE.test(text)) return "soft";
  return "unknown";
}

function looksLikeNdr(msg) {
  const from = String(msg.from || "");
  const text = `${msg.subject || ""}\n${msg.body || ""}`;
  if (NDR_FROM_RE.test(from)) return true;
  const kind = classify(text);
  return kind === "hard" || kind === "mailbox_full" || kind === "soft";
}

function isProtectedBounceEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return true;
  if (IGNORE.some((prefix) => e.startsWith(prefix) || e === prefix)) return true;
  const local = e.split("@")[0] || "";
  return local === "apple.review" || local === "applereview";
}

function extractEmails(text) {
  const found = new Set();
  for (const match of String(text).matchAll(EMAIL_RE)) {
    const email = match[0].toLowerCase();
    if (isProtectedBounceEmail(email)) continue;
    found.add(email);
  }
  return [...found];
}

function parseArgs(argv) {
  const out = { apply: false, imap: true };
  for (const a of argv) {
    if (a === "--apply") out.apply = true;
    else if (a === "--imap") out.imap = true;
    else if (a === "--no-imap") out.imap = false;
  }
  return out;
}

function runImap(command, uids = []) {
  const res = spawnSync("python3", [IMAP_PY, command, ...uids], {
    encoding: "utf8",
    cwd: ROOT,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || "imap failed").trim());
  }
  const raw = (res.stdout || "").trim();
  return raw ? JSON.parse(raw) : command === "fetch" ? [] : { trashed: 0 };
}

function supabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function normEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function loadMembers(sb) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("members")
      .select("id, first_name, last_name, member_number, email, manual_tutor_email")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

function indexMembersByEmail(members) {
  const byEmail = new Map();
  const add = (email, member, field) => {
    const key = normEmail(email);
    if (!key) return;
    const list = byEmail.get(key) || [];
    list.push({ member, field });
    byEmail.set(key, list);
  };
  for (const member of members) {
    add(member.email, member, "email");
    add(member.manual_tutor_email, member, "manual_tutor_email");
  }
  return byEmail;
}

async function clearMemberEmails(sb, bouncedEmails, membersByEmail, apply) {
  const unique = [
    ...new Set(
      bouncedEmails
        .map((e) => normEmail(e))
        .filter((e) => e && !isProtectedBounceEmail(e)),
    ),
  ];
  const results = [];
  let cleared = 0;
  let wouldClear = 0;
  let notFound = 0;

  for (const email of unique) {
    const hits = membersByEmail.get(email) || [];
    if (hits.length === 0) {
      notFound += 1;
      results.push({ email, status: "not_found" });
      continue;
    }

    const byId = new Map();
    for (const hit of hits) {
      const row = byId.get(hit.member.id) || {
        id: hit.member.id,
        first_name: hit.member.first_name,
        last_name: hit.member.last_name,
        member_number: hit.member.member_number,
        fields: [],
      };
      if (!row.fields.includes(hit.field)) row.fields.push(hit.field);
      byId.set(hit.member.id, row);
    }

    const members = [...byId.values()];
    if (apply) {
      for (const member of members) {
        const patch = {};
        if (member.fields.includes("email")) patch.email = null;
        if (member.fields.includes("manual_tutor_email")) {
          patch.manual_tutor_email = null;
        }
        const { error } = await sb.from("members").update(patch).eq("id", member.id);
        if (error) {
          results.push({
            email,
            status: "error",
            memberId: member.id,
            message: error.message,
          });
          continue;
        }
        cleared += 1;
        results.push({
          email,
          status: "cleared",
          memberId: member.id,
          memberNumber: member.member_number,
          name: `${member.first_name} ${member.last_name}`.trim(),
          fields: member.fields,
        });
      }
    } else {
      wouldClear += members.length;
      for (const member of members) {
        results.push({
          email,
          status: "would_clear",
          memberId: member.id,
          memberNumber: member.member_number,
          name: `${member.first_name} ${member.last_name}`.trim(),
          fields: member.fields,
        });
      }
    }
  }

  return { results, cleared, wouldClear, notFound };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sb = supabaseClient();
  const report = {
    apply: args.apply,
    scanned: 0,
    hardOrFull: 0,
    delays: 0,
    bouncedEmails: [],
    cleared: [],
    wouldClear: [],
    notFoundInSchool: [],
    errors: [],
    inboxTrashed: 0,
  };

  const messages = runImap("fetch");
  report.scanned = messages.length;

  const members = await loadMembers(sb);
  const membersByEmail = indexMembersByEmail(members);

  const toTrash = [];
  const toClear = new Set();

  for (const msg of messages) {
    if (!looksLikeNdr(msg)) continue;
    const text = `${msg.subject || ""}\n${msg.body || ""}`;
    const kind = classify(text);
    const emails = extractEmails(text);
    const schoolHits = emails.filter((email) => membersByEmail.has(email));

    if (kind === "soft" || kind === "unknown") {
      report.delays += 1;
      continue;
    }

    report.hardOrFull += 1;
    for (const email of emails) toClear.add(email);
    if (schoolHits.length > 0 && (msg.mailbox || "INBOX") === "INBOX") {
      toTrash.push(msg.uid);
    }
  }

  report.bouncedEmails = [...toClear].sort();

  if (toClear.size > 0) {
    const rpc = await clearMemberEmails(sb, [...toClear], membersByEmail, args.apply);
    for (const row of rpc.results) {
      if (row.status === "cleared") report.cleared.push(row);
      else if (row.status === "would_clear") report.wouldClear.push(row);
      else if (row.status === "not_found") report.notFoundInSchool.push(row.email);
      else report.errors.push(row);
    }
  }

  if (args.apply && toTrash.length > 0) {
    const trashRes = runImap("trash", toTrash);
    report.inboxTrashed = trashRes.trashed ?? toTrash.length;
  } else {
    report.inboxTrashed = args.apply ? 0 : toTrash.length;
  }

  console.log(JSON.stringify(report, null, 2));
  const actionCount = args.apply ? report.cleared.length : report.wouldClear.length;
  console.error(
    args.apply
      ? `\nOK: svuotate ${actionCount} email su associati, cestinati ${report.inboxTrashed} NDR School.`
      : `\nDry-run: ${actionCount} email da svuotare, ${report.inboxTrashed} NDR School da cestinare. Aggiungi --apply per scrivere.`,
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
