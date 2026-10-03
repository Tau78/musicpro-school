#!/usr/bin/env node
/**
 * Rimuove email non valide dal campo members.email (scheda associato resta).
 * Se c’è un indirizzo estraibile nel testo sporco → manual_tutor_email (se vuoto).
 *
 *   node scripts/clear-invalid-member-emails.mjs --dry-run
 *   node scripts/clear-invalid-member-emails.mjs
 */
import { createSmokeClients } from "./lib/supabase-smoke.mjs";

const dryRun = process.argv.includes("--dry-run");

function isValidAuthEmail(email) {
  const e = email.trim();
  if (!e || /[\s?,]/.test(e)) {
    return false;
  }
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e);
}

/** Primo indirizzo RFC-like nel testo (note tipo "email madre"). */
function extractEmbeddedEmail(raw) {
  const match = raw.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  );
  if (!match) return null;
  const candidate = match[0].trim().toLowerCase();
  return isValidAuthEmail(candidate) ? candidate : null;
}

async function memberIsAssociato(service, memberId) {
  const { data } = await service
    .from("member_roles")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  return (data ?? []).some((r) => r.role === "associato");
}

const { service } = createSmokeClients();
console.log(`=== Pulizia email non valide ${dryRun ? "(DRY-RUN)" : ""} ===\n`);

let cleared = 0;
let offset = 0;

while (offset < 20_000) {
  const { data, error } = await service
    .from("members")
    .select("id, first_name, last_name, email, manual_tutor_email")
    .not("email", "is", null)
    .range(offset, offset + 499);

  if (error) throw new Error(error.message);
  if (!data?.length) break;

  for (const row of data) {
    const raw = (row.email ?? "").trim();
    if (!raw || isValidAuthEmail(raw)) continue;
    if (!(await memberIsAssociato(service, row.id))) continue;

    const embedded = extractEmbeddedEmail(raw);
    const tutor = (row.manual_tutor_email ?? "").trim();
    const patch = { email: null };
    if (embedded && !tutor) {
      patch.manual_tutor_email = embedded;
    }

    console.log(
      `${row.first_name} ${row.last_name}: email=${JSON.stringify(raw)} → null` +
        (patch.manual_tutor_email
          ? `, tutor=${patch.manual_tutor_email}`
          : tutor
            ? " (tutor già presente)"
            : ""),
    );

    if (!dryRun) {
      const { error: updError } = await service
        .from("members")
        .update(patch)
        .eq("id", row.id);
      if (updError) throw new Error(`${row.id}: ${updError.message}`);
    }
    cleared += 1;
  }

  if (data.length < 500) break;
  offset += 500;
}

console.log(`\n${dryRun ? "Avrebbe pulito" : "Pulite"} ${cleared} schede.`);
