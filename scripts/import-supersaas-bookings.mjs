#!/usr/bin/env node
/**
 * Importa le prenotazioni future di un associato da SuperSaaS.
 *
 * Default: dry-run, nessuna scrittura.
 *   npm run import:supersaas -- --email associato@example.com
 *   npm run import:supersaas -- --email associato@example.com --apply
 *
 * --apply richiede la migration 082 sul database. Non modifica SuperSaaS,
 * non invia email e non crea pagamenti.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import {
  SCHEMA_APPLY_BLOCK,
  bookingBelongsToUser,
  buildImportedBookingRow,
  formatRomeLabel,
  loadSuperSaasCatalog,
  findSuperSaasUser,
  musicProOccupiesSlot,
  normalizeEmail,
  planSuperSaasImport,
  redactSecrets,
  safeNormalizeBooking,
  summarize,
} from "./lib/supersaas-bookings.mjs";
import {
  loadImportedExternalIds,
  markSuperSaasMirrorFresh,
  probeSuperSaasSchema,
  replaceSuperSaasMirror,
  roomsForMirror,
} from "./lib/supersaas-mirror-sync.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

function parseArgs(argv) {
  const opts = { email: "", apply: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") opts.email = argv[++i] ?? "";
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--dry-run") opts.apply = false;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argomento sconosciuto: ${arg}`);
  }
  return opts;
}

function euro(value) {
  if (value == null) return "—";
  return `${Number(value).toFixed(2)} €`;
}

function printHelp() {
  console.log(`Uso: npm run import:supersaas -- --email associato@example.com [--apply]

Senza --apply è un dry-run. SuperSaaS viene solo letto.
Account: SUPERSAAS_ACCOUNT oppure MusicPro.
Chiave: SUPERSAAS_API_KEY nel .env locale, mai in log o git.`);
}

function printRow(row) {
  console.log(`- SuperSaaS #${row.externalId}`);
  console.log(`  Sala: ${row.roomName || "—"}`);
  console.log(`  Inizio: ${formatRomeLabel(row.startMs)}`);
  console.log(`  Fine: ${formatRomeLabel(row.endMs)}`);
  console.log(`  Durata: ${row.durationMinutes} min`);
  console.log(`  Prezzo: ${euro(row.priceEur)}`);
  console.log(`  Note: ${row.note || "—"}`);
  console.log(`  Esito: ${row.kind} — ${row.reason}`);
}

function printSummary(summary) {
  console.log("");
  console.log("Riepilogo");
  console.log(`  Trovate: ${summary.trovate}`);
  console.log(`  Importabili: ${summary.importabili}`);
  console.log(`  Duplicate: ${summary.duplicate}`);
  console.log(`  In conflitto: ${summary.inConflitto}`);
  console.log(`  Importate: ${summary.importate}`);
  console.log(`  Errori: ${summary.errori}`);
}

async function loadMember(supabase, email) {
  const { data, error } = await supabase
    .from("members")
    .select("id, email, first_name, last_name")
    .ilike("email", email);
  if (error) throw new Error(error.message);
  const matches = (data ?? []).filter((row) => normalizeEmail(row.email) === email);
  if (matches.length === 0) {
    throw new Error(
      `Nessun associato con email ${email}. Import interrotto: non creo un associato.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Più associati con email ${email}. Import interrotto, nessuna prenotazione creata.`,
    );
  }
  return matches[0];
}

async function loadOccupying(supabase, nowIso, withExternal) {
  const columns = withExternal
    ? "id, room_id, start_at, end_at, status, payment_status, credits_held, external_id"
    : "id, room_id, start_at, end_at, status, payment_status, credits_held";
  const { data, error } = await supabase
    .from("bookings")
    .select(columns)
    .gt("end_at", nowIso)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => musicProOccupiesSlot(row)).map((row) => ({
    id: row.id,
    roomId: row.room_id,
    externalId: row.external_id ?? null,
    startMs: Date.parse(row.start_at),
    endMs: Date.parse(row.end_at),
  }));
}

async function main() {
  const apiKey = process.env.SUPERSAAS_API_KEY?.trim() ?? "";
  const account = process.env.SUPERSAAS_ACCOUNT?.trim() || "MusicPro";
  const fail = (error) => {
    const message = redactSecrets(error instanceof Error ? error.message : String(error), [
      apiKey,
    ]);
    console.error(message);
    process.exit(1);
  };

  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      return;
    }
    const email = normalizeEmail(opts.email);
    if (!email) throw new Error("Serve --email con un indirizzo valido.");
    if (!apiKey) {
      throw new Error(
        "SUPERSAAS_API_KEY mancante. Mettila nel .env locale (gitignored), non in chat, commit o PR.",
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatori nel .env");
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const member = await loadMember(supabase, email);
    const schema = await probeSuperSaasSchema(supabase);
    if (!schema.ready && !schema.missing) {
      throw new Error(schema.error?.message || "Schema prenotazioni illeggibile");
    }
    const catalog = await loadSuperSaasCatalog({ apiKey, account, now });
    const user = await findSuperSaasUser({ apiKey, account, email });

    const normalized = [];
    const parseErrors = [];
    for (const raw of catalog.rawBookings) {
      const result = safeNormalizeBooking(raw, catalog.resourcesById);
      if (!result.ok) {
        parseErrors.push(`#${result.externalId}: ${result.message}`);
        continue;
      }
      normalized.push({ raw, booking: result.booking });
    }

    const memberBookings = normalized
      .filter((item) => bookingBelongsToUser(item.raw, user, email))
      .map((item) => item.booking);

    if (!user && memberBookings.length === 0) {
      throw new Error(
        `Nessun utente SuperSaaS con email ${email}. Import interrotto, nessuna prenotazione attribuita.`,
      );
    }

    const { data: roomRows, error: roomError } = await supabase
      .from("rooms")
      .select("id, name, is_active");
    if (roomError) throw new Error(roomError.message);
    const roomsByKey = roomsForMirror(roomRows);

    let importedIds = new Set();
    if (schema.ready) {
      importedIds = await loadImportedExternalIds(supabase);
    }
    const occupying = await loadOccupying(
      supabase,
      new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      schema.ready,
    );

    const plan = planSuperSaasImport({
      memberBookings,
      mirrorSource: normalized.map((item) => item.booking),
      roomsByKey,
      importedExternalIds: importedIds,
      occupying,
      nowMs: now.getTime(),
    });
    if (parseErrors.length) {
      plan.blocked = true;
      plan.unknownResources.push(...parseErrors);
      plan.mirror = [];
      for (const row of plan.rows) {
        if (row.kind === "importable") {
          row.kind = "error";
          row.reason = "import bloccato: prenotazione SuperSaaS illeggibile";
        }
      }
      plan.summary = summarize(plan.rows, 0);
    }

    console.log(opts.apply ? "APPLY" : "DRY RUN — nessuna scrittura");
    console.log(
      `Associato: ${member.first_name ?? ""} ${member.last_name ?? ""}`.trim(),
    );
    console.log(`Email: ${email}`);
    console.log(`Schedule: ${catalog.schedule.name} (${catalog.schedule.id})`);
    console.log(
      `Risorse: ${catalog.resources.map((resource) => resource.name).join(", ") || "—"}`,
    );
    console.log(
      `Utente SuperSaaS: ${user ? `id ${user.id}` : "non in anagrafica, match sulla prenotazione"}`,
    );
    console.log("");
    if (plan.rows.length === 0) {
      console.log("Nessuna prenotazione futura attiva per questo associato.");
    } else {
      for (const row of plan.rows) printRow(row);
    }
    console.log("");
    console.log(
      `Specchio anonimo previsto (slot futuri o in corso, senza nominativi): ${plan.mirror.length}`,
    );
    if (plan.unknownResources.length) {
      console.log(`Risorse o dati non gestibili: ${plan.unknownResources.join(", ")}`);
    }
    if (!schema.ready) {
      console.log("");
      console.log(SCHEMA_APPLY_BLOCK);
    } else {
      console.log(
        "Dopo il primo sync lo specchio va aggiornato almeno ogni 30 minuti (cron /api/cron/supersaas-mirror). Se scade, le nuove occupazioni sala vengono rifiutate.",
      );
    }
    printSummary(plan.summary);

    if (!opts.apply) return;
    if (!schema.ready || plan.blocked) {
      throw new Error(
        plan.blocked
          ? `APPLY interrotto. Risorse o dati non gestibili: ${plan.unknownResources.join(", ")}`
          : SCHEMA_APPLY_BLOCK,
      );
    }

    await replaceSuperSaasMirror(supabase, plan.mirror);
    await markSuperSaasMirrorFresh(supabase);

    let importedCount = 0;
    const errors = [];
    for (const row of plan.rows) {
      if (row.kind !== "importable") continue;
      const insert = buildImportedBookingRow({ memberId: member.id, row });
      const { error } = await supabase.from("bookings").insert(insert);
      if (!error) {
        importedCount += 1;
        const removed = await supabase
          .from("supersaas_slot_mirrors")
          .delete()
          .eq("external_id", row.externalId);
        if (removed.error) {
          errors.push(`#${row.externalId}: importata ma specchio non rimosso`);
        }
        continue;
      }
      if (error.code === "23505" && /external/i.test(error.message ?? "")) {
        plan.rows.find((item) => item.externalId === row.externalId).kind = "duplicate";
        continue;
      }
      errors.push(
        `#${row.externalId}: ${redactSecrets(error.message, [apiKey]).slice(0, 200)}`,
      );
    }

    const finalSummary = summarize(plan.rows, importedCount);
    finalSummary.errori += errors.length;
    console.log("");
    console.log("Scrittura completata. SuperSaaS non è stato modificato. Nessuna email inviata.");
    printSummary(finalSummary);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exit(1);
    }
  } catch (error) {
    fail(error);
  }
}

main();
