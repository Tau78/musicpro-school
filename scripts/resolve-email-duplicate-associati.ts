/**
 * Risolve email duplicate in anagrafica associati:
 * - MERGE: stesso nominativo / stesso CF → mergeDuplicateMembers (una persona, due schede)
 * - SPLIT: famiglia (CF diversi) → email resta sul titolare login; altri → manual_tutor_email + email null
 *
 * Usage:
 *   npx tsx scripts/resolve-email-duplicate-associati.ts --dry-run
 *   npx tsx scripts/resolve-email-duplicate-associati.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { mergeDuplicateMembers } from "../musicpro/packages/database/src/members-merge";

function loadEnv() {
  const root = join(import.meta.dirname, "..");
  for (const rel of ["musicpro/.env", "musicpro/.env.local"]) {
    try {
      for (const line of readFileSync(join(root, rel), "utf8").split("\n")) {
        const i = line.indexOf("=");
        if (i < 1 || line.startsWith("#")) continue;
        const k = line.slice(0, i).trim();
        if (!process.env[k]) process.env[k] = line.slice(i + 1).trim();
      }
    } catch {
      /* ignore */
    }
  }
}

const dryRun = process.argv.includes("--dry-run");

function normEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  tax_code: string | null;
  user_id: string | null;
  member_number: number | null;
  manual_tutor_email: string | null;
};

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
}

const service = createClient(url, serviceKey);

async function memberIsAssociato(memberId: string): Promise<boolean> {
  const { data } = await service
    .from("member_roles")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  return (data ?? []).some((r) => r.role === "associato");
}

async function loadDuplicateEmailGroups(): Promise<Map<string, MemberRow[]>> {
  const byEmail = new Map<string, MemberRow[]>();
  let offset = 0;
  while (offset < 20_000) {
    const { data, error } = await service
      .from("members")
      .select(
        "id, first_name, last_name, email, tax_code, user_id, member_number, manual_tutor_email",
      )
      .not("email", "is", null)
      .range(offset, offset + 499);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const email = normEmail(row.email);
      if (!validEmail(email)) continue;
      if (!(await memberIsAssociato(row.id))) continue;
      const list = byEmail.get(email) ?? [];
      list.push(row as MemberRow);
      byEmail.set(email, list);
    }
    if (data.length < 500) break;
    offset += 500;
  }
  return new Map([...byEmail.entries()].filter(([, arr]) => arr.length > 1));
}

function isNameDuplicatePair(a: MemberRow, b: MemberRow): boolean {
  const na = normName(a.first_name) + normName(a.last_name);
  const nb = normName(b.first_name) + normName(b.last_name);
  const ra = normName(a.last_name) + normName(a.first_name);
  return na === nb || na === ra || nb === ra;
}

function pickLoginHolder(members: MemberRow[]): MemberRow {
  const withAuth = members.filter((m) => m.user_id);
  if (withAuth.length >= 1) {
    return [...withAuth].sort(
      (a, b) => (a.member_number ?? 1e9) - (b.member_number ?? 1e9),
    )[0]!;
  }
  return [...members].sort(
    (a, b) => (a.member_number ?? 1e9) - (b.member_number ?? 1e9),
  )[0]!;
}

async function doMerge(
  canonicalId: string,
  duplicateId: string,
  label: string,
): Promise<boolean> {
  console.log(`MERGE ${label}`);
  if (dryRun) {
    console.log(`  canon ${canonicalId} ← dup ${duplicateId}`);
    return true;
  }
  const result = await mergeDuplicateMembers(service, canonicalId, duplicateId);
  if (!result.success) {
    console.error(`  ERR ${result.errorMessage}`);
    return false;
  }
  console.log(`  OK`);
  return true;
}

async function splitSharedEmail(group: MemberRow[], sharedEmail: string) {
  const holder = pickLoginHolder(group);
  const others = group.filter((m) => m.id !== holder.id);
  console.log(
    `SPLIT ${sharedEmail}: login → ${holder.first_name} ${holder.last_name} (#${holder.member_number})`,
  );
  for (const m of others) {
    const tutor = (m.manual_tutor_email ?? "").trim() || sharedEmail;
    console.log(
      `  · ${m.first_name} ${m.last_name} (#${m.member_number}): email→null, tutor=${tutor}`,
    );
    if (dryRun) continue;
    const { error } = await service
      .from("members")
      .update({ email: null, manual_tutor_email: tutor })
      .eq("id", m.id);
    if (error) throw new Error(`${m.id}: ${error.message}`);
  }
}

async function main() {
  console.log(`=== Risoluzione email duplicate ${dryRun ? "(DRY-RUN)" : ""} ===\n`);

  const explicitMerges: {
    canonicalId: string;
    duplicateId: string;
    note: string;
  }[] = [
    {
      canonicalId: "6fb50e1b-7009-46be-b4b9-864b786142f1",
      duplicateId: "c0a2d26b-e754-4524-9041-cb7bdd142581",
      note: "Samantha Acerbi (doppia scheda stesso nome)",
    },
    {
      canonicalId: "7523ec74-2fe4-4359-8cd0-b34a2c30d58b",
      duplicateId: "c678532b-f861-42a1-afa5-f659a661533f",
      note: "Stephan/Stephen Hoch (stessa persona, CF solo su Stephan)",
    },
  ];

  for (const m of explicitMerges) {
    await doMerge(m.canonicalId, m.duplicateId, m.note);
  }

  const groups = await loadDuplicateEmailGroups();
  for (const [email, members] of [...groups.entries()].sort()) {
    if (members.length === 2) {
      const [a, b] = members;
      const cfA = (a.tax_code ?? "").trim().toUpperCase();
      const cfB = (b.tax_code ?? "").trim().toUpperCase();
      if (cfA && cfB && cfA === cfB) {
        const canonical = pickLoginHolder(members);
        const duplicate = members.find((m) => m.id !== canonical.id)!;
        await doMerge(
          canonical.id,
          duplicate.id,
          `${email} (stesso CF)`,
        );
        continue;
      }
      if (isNameDuplicatePair(a, b) && (!cfA || !cfB)) {
        const canonical = pickLoginHolder(members);
        const duplicate = members.find((m) => m.id !== canonical.id)!;
        await doMerge(
          canonical.id,
          duplicate.id,
          `${email} (stesso nominativo)`,
        );
        continue;
      }
    }

    await splitSharedEmail(members, email);
  }

  console.log(
    "\nFatto. Per login individuali mancanti: email dedicata in rubrica + npm run backfill:associate-auth",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
