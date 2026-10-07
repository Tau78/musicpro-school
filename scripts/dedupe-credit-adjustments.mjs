#!/usr/bin/env node
/**
 * Deduplica rettifiche crediti fluttuanti (senza booking/purchase):
 * stesso member + amount + type + reason → tiene la più vecchia.
 *
 *   node scripts/dedupe-credit-adjustments.mjs --dry-run
 *   node scripts/dedupe-credit-adjustments.mjs --apply
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });

const apply = process.argv.includes("--apply");
const dryRun = !apply || process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: all, error } = await sb
  .from("credit_transactions")
  .select("*")
  .eq("type", "adjustment")
  .is("booking_id", null)
  .is("purchase_id", null)
  .order("created_at");
if (error) throw new Error(error.message);

const { data: members } = await sb
  .from("members")
  .select("id, email, first_name, last_name");
const byId = Object.fromEntries((members ?? []).map((m) => [m.id, m]));

const groups = new Map();
for (const t of all ?? []) {
  const key = [t.member_id, String(t.amount), t.type, t.reason ?? ""].join("|");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}

const deleteIds = [];
for (const txs of groups.values()) {
  if (txs.length < 2) continue;
  const sorted = [...txs].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const keep = sorted[0];
  const drop = sorted.slice(1);
  const m = byId[keep.member_id];
  console.log(
    `${m?.first_name ?? ""} ${m?.last_name ?? ""} <${m?.email ?? ""}> amount=${keep.amount} reason=${keep.reason} keep=${keep.id} drop=${drop.length}`,
  );
  for (const d of drop) console.log(`  - ${d.id} @ ${d.created_at}`);
  deleteIds.push(...drop.map((d) => d.id));
}

if (!deleteIds.length) {
  console.log("Nessun duplicato trovato.");
  process.exit(0);
}

console.log(
  dryRun
    ? `DRY-RUN: eliminerei ${deleteIds.length} movimenti.`
    : `APPLY: elimino ${deleteIds.length} movimenti.`,
);

if (!dryRun) {
  const { error: delErr } = await sb
    .from("credit_transactions")
    .delete()
    .in("id", deleteIds);
  if (delErr) throw new Error(delErr.message);
  console.log("Fatto.");
}
