#!/usr/bin/env node
/**
 * Crea account Supabase Auth per associati con email in anagrafica (user_id null o incoerente).
 * Dopo il backfill: Recupera password e Link email funzionano senza reset manuale admin.
 *
 * Usage:
 *   node scripts/backfill-associate-auth.mjs --dry-run
 *   node scripts/backfill-associate-auth.mjs
 *   node scripts/backfill-associate-auth.mjs --limit 20
 *   node scripts/backfill-associate-auth.mjs --email luigi.castello1@gmail.com
 */
import { randomBytes } from "node:crypto";

import {
  authApi,
  createAuthUser,
  createSmokeClients,
} from "./lib/supabase-smoke.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit =
  limitArg >= 0 && args[limitArg + 1]
    ? Number.parseInt(args[limitArg + 1], 10)
    : null;
const emailArg = args.indexOf("--email");
const onlyEmail =
  emailArg >= 0 && args[emailArg + 1]
    ? args[emailArg + 1].trim().toLowerCase()
    : null;

function randomPassword() {
  return `Mp${randomBytes(18).toString("base64url")}!`;
}

/** Auth / SMTP-safe; esclude note in campo email in anagrafica. */
function isValidAuthEmail(email) {
  const e = email.trim();
  if (!e || /[\s?]/.test(e) || e.includes(",")) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e);
}

async function loadAuthUsersByEmail(supabaseUrl, serviceKey) {
  const map = new Map();
  let page = 1;
  while (page <= 50) {
    const data = await authApi(
      supabaseUrl,
      serviceKey,
      "GET",
      `/auth/v1/admin/users?page=${page}&per_page=200`,
    );
    const users = data?.users ?? [];
    for (const user of users) {
      const mail = (user.email ?? "").trim().toLowerCase();
      if (mail) map.set(mail, user.id);
    }
    if (users.length < 200) break;
    page += 1;
  }
  return map;
}

async function memberIsAssociato(service, memberId) {
  const { data, error } = await service
    .from("member_roles")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).some((row) => row.role === "associato");
}

async function linkUserIdIfNeeded(service, memberId, userId, dry) {
  const { data: member, error } = await service
    .from("members")
    .select("user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("member missing");
  if (member.user_id === userId) return "linked_ok";
  if (member.user_id && member.user_id !== userId) {
    return "conflict_user_id";
  }
  if (dry) return "would_link";
  const { error: updError } = await service
    .from("members")
    .update({ user_id: userId })
    .eq("id", memberId)
    .is("user_id", null);
  if (updError) {
    if (updError.code === "23505") return "conflict_unique";
    throw new Error(updError.message);
  }
  const { data: again } = await service
    .from("members")
    .select("user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (again?.user_id === userId) return "linked";
  if (again?.user_id) return "conflict_user_id";
  return "link_failed";
}

const { supabaseUrl, serviceKey, service } = createSmokeClients();

console.log(
  `=== Backfill Auth associati ${dryRun ? "(DRY-RUN)" : ""} ===\n`,
);

const authByEmail = await loadAuthUsersByEmail(supabaseUrl, serviceKey);
console.log(`Auth users in project: ${authByEmail.size}\n`);

const stats = {
  scanned: 0,
  skipped_not_associato: 0,
  skipped_no_email: 0,
  skipped_filter_email: 0,
  already_ok: 0,
  linked_existing_auth: 0,
  created_auth: 0,
  conflict: 0,
  errors: 0,
};

const seenEmails = new Map();
const pageSize = 200;
let offset = 0;
let processed = 0;

while (true) {
  const { data: batch, error } = await service
    .from("members")
    .select("id, first_name, last_name, email, user_id, is_active")
    .order("created_at", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) throw new Error(error.message);
  if (!batch?.length) break;

  for (const member of batch) {
    if (limit != null && processed >= limit) break;

    const email = (member.email ?? "").trim().toLowerCase();
    if (!email || !isValidAuthEmail(email)) {
      stats.skipped_no_email++;
      if (email && email.includes("@") && !isValidAuthEmail(email)) {
        console.warn(`SKIP email non valida: ${email.slice(0, 60)}`);
      }
      continue;
    }

    if (onlyEmail && email !== onlyEmail) {
      stats.skipped_filter_email++;
      continue;
    }

    if (!(await memberIsAssociato(service, member.id))) {
      stats.skipped_not_associato++;
      continue;
    }

    stats.scanned++;
    processed++;

    if (seenEmails.has(email)) {
      console.warn(
        `SKIP duplicate email in anagrafica: ${email} (${member.first_name} ${member.last_name})`,
      );
      stats.conflict++;
      continue;
    }
    seenEmails.set(email, member.id);

    const authId = authByEmail.get(email);
    if (member.user_id && authId && member.user_id === authId) {
      stats.already_ok++;
      continue;
    }

    if (authId) {
      const linkResult = await linkUserIdIfNeeded(
        service,
        member.id,
        authId,
        dryRun,
      );
      if (linkResult === "linked_ok") {
        stats.already_ok++;
        continue;
      }
      if (
        linkResult === "linked" ||
        linkResult === "would_link" ||
        linkResult === "linked_ok"
      ) {
        stats.linked_existing_auth++;
        console.log(
          `${dryRun ? "[dry]" : "OK"} link ${email} → auth ${authId.slice(0, 8)}…`,
        );
        continue;
      }
      console.warn(`CONFLICT ${email}: ${linkResult} (member ${member.id})`);
      stats.conflict++;
      continue;
    }

    if (member.user_id && !authId) {
      console.warn(
        `CONFLICT ${email}: user_id ${member.user_id} but no auth user — needs manual fix`,
      );
      stats.conflict++;
      continue;
    }

    if (dryRun) {
      stats.created_auth++;
      console.log(`[dry] would create auth ${email}`);
      continue;
    }

    try {
      const password = randomPassword();
      const created = await createAuthUser(
        supabaseUrl,
        serviceKey,
        email,
        password,
      );
      const userId = created.id ?? created.user?.id;
      if (!userId) throw new Error("createUser senza id");
      authByEmail.set(email, userId);
      const linkResult = await linkUserIdIfNeeded(
        service,
        member.id,
        userId,
        false,
      );
      if (
        linkResult !== "linked" &&
        linkResult !== "linked_ok" &&
        linkResult !== "would_link"
      ) {
        console.warn(
          `WARN ${email}: auth creato ${userId} link=${linkResult} (trigger può aver già collegato)`,
        );
      }
      stats.created_auth++;
      if (stats.created_auth % 25 === 0) {
        console.log(`… creati ${stats.created_auth} account Auth`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // createUser può fallire se il trigger linka male o email già in Auth:
      // ricarica mappa e prova solo il link a QUESTO member.
      if (
        /already|registered|exists|members_user_id_key|23505/i.test(msg)
      ) {
        const refreshed = await loadAuthUsersByEmail(supabaseUrl, serviceKey);
        for (const [mail, id] of refreshed) authByEmail.set(mail, id);
        const existingId = authByEmail.get(email);
        if (existingId) {
          const linkResult = await linkUserIdIfNeeded(
            service,
            member.id,
            existingId,
            false,
          );
          if (
            linkResult === "linked" ||
            linkResult === "linked_ok" ||
            linkResult === "would_link"
          ) {
            stats.linked_existing_auth++;
            console.log(
              `OK recover-link ${email} → auth ${existingId.slice(0, 8)}…`,
            );
            continue;
          }
          console.warn(
            `SKIP ${email}: email già usata da un altro profilo (user_id unico). Figli/tutori con stessa email: solo uno può avere Auth.`,
          );
          stats.conflict++;
          continue;
        }
      }
      console.error(`ERR ${email}: ${msg}`);
      stats.errors++;
    }
  }

  if (limit != null && processed >= limit) break;
  if (batch.length < pageSize) break;
  offset += pageSize;
}

console.log("\n--- Riepilogo ---");
console.log(JSON.stringify(stats, null, 2));
console.log(
  "\nGli associati possono usare Recupera password o Link email (stessa email in anagrafica).",
);
console.log("La password iniziale è casuale e sconosciuta — non serve finché usano link/recovery.\n");

if (stats.errors > 0) process.exit(1);
