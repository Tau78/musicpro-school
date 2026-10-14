#!/usr/bin/env node
/**
 * Timeline eventi pilot lezioni (cohort pilot_cohort_members).
 *
 *   npm run pilot:usage-report
 *   npm run pilot:usage-report -- --since 2026-10-14 --limit 200
 */
import { createSmokeClients, signInClient } from "./lib/supabase-smoke.mjs";

const { anonKey, supabaseUrl } = createSmokeClients();

const args = process.argv.slice(2);
let since = new Date(Date.now() - 7 * 864e5).toISOString();
let limit = 500;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--since" && args[i + 1]) {
    since = new Date(args[++i]).toISOString();
  }
  if (args[i] === "--limit" && args[i + 1]) {
    limit = Number.parseInt(args[++i], 10) || limit;
  }
}

const email = process.env.PILOT_REPORT_EMAIL ?? "andreoni.mauro@gmail.com";
const password = process.env.PILOT_REPORT_PASSWORD;
if (!password) {
  console.error(
    "Imposta PILOT_REPORT_PASSWORD (account staff) per leggere il report.",
  );
  process.exit(1);
}

const client = await signInClient(supabaseUrl, anonKey, email, password);
const { data, error } = await client.rpc("list_pilot_usage_events", {
  p_since: since,
  p_limit: limit,
});

if (error) {
  console.error("RPC fallita:", error.message);
  process.exit(1);
}

const rows = data ?? [];
console.log(`Pilot usage — ${rows.length} eventi da ${since}\n`);

for (const row of rows) {
  const t = new Date(row.created_at).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
  });
  const who = `${row.role_in_cohort} ${row.display_name?.trim() || row.email}`;
  const route = row.route ? ` ${row.route}` : "";
  const props =
    row.properties && Object.keys(row.properties).length
      ? ` ${JSON.stringify(row.properties)}`
      : "";
  console.log(`${t} | ${who} | ${row.event_type} ${row.event_name}${route}${props}`);
}

if (rows.length === 0) {
  console.log(
    "Nessun evento. Verifica: db push 112, deploy web, allievi in pilot_cohort_members.",
  );
}
