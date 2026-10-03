#!/usr/bin/env node
/**
 * Export utenti SuperSaaS → anagrafica, accesso, saldo.
 *
 * Default: dry-run. Le password non vengono stampate.
 *   npm run import:supersaas-users -- --file "/path/MusicPro.xls"
 *   npm run import:supersaas-users -- --file "/path/MusicPro.xls" --apply
 *
 * Crea un associato solo se non c'è corrispondenza e risulta una quota versata.
 * Copia la password SuperSaaS solo su un accesso mai usato e chiede di
 * sostituirla al primo ingresso. I centesimi del saldo si scrivono solo se
 * la migration 084 è già sul database.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { normalizeEmail } from "./lib/supersaas-bookings.mjs";
import {
  classifySuperSaasUser,
  creditReason,
  parseSuperSaasUserExport,
  splitPersonName,
  summarizeUserPlans,
} from "./lib/supersaas-users.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const MIN_PASSWORD = 8;

function parseArgs(argv) {
  const opts = {
    file: "/Users/mauroandreoni/Downloads/MusicPro.xls",
    apply: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") opts.file = argv[++i] ?? "";
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--dry-run") opts.apply = false;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argomento sconosciuto: ${arg}`);
  }
  return opts;
}

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function surnameFallback(user, members, plan) {
  if (plan.decision !== "ignore") return plan;
  const tokens = fold(user.fullName).split(" ").filter(Boolean);
  if (tokens.length < 2) return plan;
  const last = tokens.slice(1).join(" ");
  const hits = members.filter((member) => fold(member.last_name) === last);
  if (hits.length === 1) {
    return {
      ...plan,
      decision: "found_name",
      memberId: hits[0].id,
      detail: `solo cognome: ${hits[0].first_name} ${hits[0].last_name}`.trim(),
      surnameOnly: true,
    };
  }
  if (hits.length > 1) {
    return {
      ...plan,
      decision: "ambiguous",
      detail: `cognome condiviso da ${hits.length} associati`,
    };
  }
  return plan;
}

async function loadAll(supabase, table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function redact(message, password) {
  if (!password) return message;
  return String(message).split(password).join("[password]");
}

async function creditsReady(supabase) {
  const { data, error } = await supabase.rpc("credit_ledger_scale");
  if (error) return false;
  return Number(data) === 2;
}

async function findAuthUser(supabase, email) {
  const target = normalizeEmail(email);
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    const found = users.find((user) => normalizeEmail(user.email) === target);
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}

async function setImportedPassword(supabase, memberId, email, password) {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, user_id, email")
    .eq("id", memberId)
    .single();
  if (memberError) throw new Error(memberError.message);

  let authUser = null;
  if (member.user_id) {
    const { data, error } = await supabase.auth.admin.getUserById(member.user_id);
    if (error) throw new Error(redact(error.message, password));
    authUser = data.user ?? null;
  }
  if (!authUser) authUser = await findAuthUser(supabase, email);
  if (authUser?.last_sign_in_at) return "keep";

  const metadata = {
    ...(authUser?.user_metadata ?? {}),
    password_change_required: true,
  };
  if (authUser) {
    const patch = { password, email_confirm: true, user_metadata: metadata };
    if (normalizeEmail(authUser.email) !== email) patch.email = email;
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, patch);
    if (error) throw new Error(redact(error.message, password));
    if (member.user_id !== authUser.id) {
      const { error: linkError } = await supabase
        .from("members")
        .update({ user_id: authUser.id })
        .eq("id", memberId);
      if (linkError) throw new Error(linkError.message);
    }
    return "set";
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { password_change_required: true },
  });
  if (error || !data.user) {
    throw new Error(redact(error?.message || "Accesso non creato.", password));
  }
  const { error: linkError } = await supabase
    .from("members")
    .update({ user_id: data.user.id })
    .eq("id", memberId)
    .is("user_id", null);
  if (linkError) throw new Error(linkError.message);
  return "set";
}

async function writeSaldo(supabase, memberId, email, amount) {
  const reason = creditReason(email);
  const { data: existing, error: readError } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("member_id", memberId)
    .eq("reason", reason)
    .limit(1);
  if (readError) throw new Error(readError.message);
  if (existing?.length) return;
  const { error } = await supabase.from("credit_transactions").insert({
    member_id: memberId,
    amount,
    type: "adjustment",
    reason,
  });
  if (error) throw new Error(error.message);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Uso: npm run import:supersaas-users -- --file "/path/MusicPro.xls" [--apply]`);
    return;
  }
  if (!fs.existsSync(opts.file)) throw new Error(`File non trovato: ${opts.file}`);

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const users = parseSuperSaasUserExport(fs.readFileSync(opts.file, "utf8"));
  const members = await loadAll(
    supabase,
    "members",
    "id, email, first_name, last_name, user_id, phone",
  );
  const enrollments = await loadAll(
    supabase,
    "enrollments",
    "id, member_id, email, first_name, last_name, fiscal_year, amount_centesimi, payment_status, payment_total_centesimi, paid_at",
  );
  const quotas = await loadAll(
    supabase,
    "member_annual_quotas",
    "member_id, fiscal_year, paid_at, amount_paid_eur",
  );
  const catalog = { members, enrollments, quotas };
  const centsOk = await creditsReady(supabase);
  const plans = users.map((user) => surnameFallback(user, members, classifySuperSaasUser(user, catalog)));
  const summary = summarizeUserPlans(plans);

  let memberNumber = null;
  if (opts.apply) {
    const { data, error } = await supabase
      .from("members")
      .select("member_number")
      .not("member_number", "is", null)
      .order("member_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    memberNumber = (data?.member_number ?? 0) + 1;
  }

  const lines = [];
  const counts = { passwordSet: 0, passwordKeep: 0, passwordShort: 0, errors: 0 };

  for (const user of users) {
    const password = user.password;
    user.password = "";
    const plan = plans.find((row) => row.email === user.email);
    try {
      const member = members.find((row) => row.id === plan.memberId) ?? null;
      if (plan.decision === "ignore" || plan.decision === "ambiguous" || plan.surnameOnly) {
        lines.push(`${plan.decision} ${user.email} (${user.fullName}) — ${plan.detail}`);
      } else if (plan.decision === "found_name" && member) {
        lines.push(
          `nome ${user.email} → ${member.email || "senza email"} (${member.first_name} ${member.last_name})`,
        );
      }

      let memberId = plan.memberId ?? null;
      if (plan.decision === "create") {
        lines.push(`crea ${user.email} (${user.fullName}) — ${plan.detail}`);
        if (opts.apply) {
          const parsed = splitPersonName(user.fullName);
          const { data, error } = await supabase
            .from("members")
            .insert({
              first_name: parsed.firstName,
              last_name: parsed.lastName || parsed.firstName,
              email: user.email,
              phone: user.phone || null,
              is_active: true,
              is_enrollment_draft: false,
              member_number: memberNumber,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          memberNumber += 1;
          memberId = data.id;
          for (const year of plan.quotaYears ?? []) {
            const source = (plan.enrollments ?? []).find((row) => row.fiscal_year === year);
            const { error: quotaError } = await supabase.from("member_annual_quotas").insert({
              member_id: memberId,
              fiscal_year: year,
              paid_at: source?.paid_at || new Date().toISOString(),
              amount_paid_eur: source ? Number(source.amount_centesimi || 0) / 100 : null,
            });
            if (quotaError && quotaError.code !== "23505") throw new Error(quotaError.message);
          }
        }
      }

      const samePerson =
        plan.decision === "found_email" ||
        (plan.decision === "found_name" && !plan.surnameOnly) ||
        plan.decision === "found_enrollment" ||
        plan.decision === "create";
      if (opts.apply && samePerson && memberId && user.creditEur > 0 && centsOk) {
        await writeSaldo(supabase, memberId, user.email, user.creditEur);
      }

      const memberEmail = normalizeEmail(member?.email);
      const emailTaken = members.some(
        (row) => row.id !== member?.id && normalizeEmail(row.email) === user.email,
      );
      const attachEmail =
        plan.decision === "found_name" && !plan.surnameOnly && member && !memberEmail && !emailTaken;
      if (attachEmail) {
        lines.push(`${user.email}: anagrafica senza email, collegata a ${member.first_name} ${member.last_name}`);
        if (opts.apply) {
          const { error } = await supabase.from("members").update({ email: user.email }).eq("id", member.id);
          if (error) throw new Error(error.message);
          member.email = user.email;
        }
      }

      const authTarget =
        plan.decision === "found_email" || plan.decision === "create" || attachEmail;
      if (!authTarget) continue;
      if (password.length < MIN_PASSWORD) {
        counts.passwordShort += 1;
        lines.push(`${user.email}: password SuperSaaS sotto gli 8 caratteri, accesso non impostato`);
        continue;
      }
      if (!opts.apply) {
        let signedIn = false;
        if (member?.user_id) {
          const { data } = await supabase.auth.admin.getUserById(member.user_id);
          signedIn = Boolean(data.user?.last_sign_in_at);
        }
        if (signedIn) counts.passwordKeep += 1;
        else counts.passwordSet += 1;
        continue;
      }
      const result = await setImportedPassword(supabase, memberId, user.email, password);
      if (result === "keep") counts.passwordKeep += 1;
      else counts.passwordSet += 1;
    } catch (error) {
      counts.errors += 1;
      const message = error instanceof Error ? error.message : "errore";
      lines.push(`${user.email}: ${redact(message, password)}`);
    }
  }

  console.log(opts.apply ? "Scrittura" : "Dry-run");
  console.log(`Export: ${summary.totale}`);
  console.log(`Email: ${summary.trovatiEmail}`);
  console.log(`Nome e cognome: ${summary.trovatiNome}`);
  console.log(`Iscrizione già collegata: ${summary.trovatiIscrizione}`);
  console.log(`Da creare (quota versata): ${summary.daCreare}`);
  console.log(`Ignorati (mai una quota): ${summary.ignorati}`);
  console.log(`Ambiguo: ${summary.ambigui}`);
  console.log(`Password da impostare: ${counts.passwordSet}`);
  console.log(`Password già in uso, lasciate: ${counts.passwordKeep}`);
  console.log(`Password troppo corte: ${counts.passwordShort}`);
  console.log(
    `Saldi sulle persone trovate o create: ${summary.creditoTrovati.toFixed(2)} € + ${summary.creditoDaCreare.toFixed(2)} €` +
      (centsOk ? "" : " — centesimi non ancora sul database, saldo non scritto"),
  );
  console.log(`Saldi non scritti (ignorati): ${summary.creditoIgnorato.toFixed(2)} €`);
  console.log(`Errori: ${counts.errors}`);
  for (const line of lines) console.log(`- ${line}`);
  if (!centsOk) {
    console.log("I centesimi arrivano con la migration 084. Fino ad allora il mezzo euro non si scrive.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Import utenti non riuscito.");
  process.exit(1);
});
