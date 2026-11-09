#!/usr/bin/env node
/**
 * Abilita fasce serata operativa (lun–ven default 20–24) in app_settings.
 * Uso: node scripts/set-lm-operational-schedule.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ENABLE_WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri"]);
const BAND_START = process.env.LM_BAND_START?.trim() || "20:00";
const BAND_END = process.env.LM_BAND_END?.trim() || "24:00";

function defaultDay(enabled) {
  return {
    enabled,
    bandStart: BAND_START,
    bandEnd: BAND_END,
    approvalMinHoursOperational: 0,
    autoConfirmMinHoursOperational: 0,
  };
}

function buildSchedule() {
  return Object.fromEntries(
    WEEKDAYS.map((key) => [key, defaultDay(ENABLE_WEEKDAYS.has(key))]),
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const schedule = buildSchedule();

console.log("Schedule proposto (lun–ven On, sab–dom Off):");
console.log(JSON.stringify(schedule, null, 2));

if (!apply) {
  console.log("\nDry-run. Aggiungi --apply per scrivere su Supabase.");
  process.exit(0);
}

const supabase = createClient(url, key);
const { error } = await supabase.from("app_settings").upsert(
  {
    key: "booking_operational_week_schedule",
    value: JSON.stringify(schedule),
    description:
      "Fasce serata operativa e soglie last minute per giorno (JSON).",
    updated_at: new Date().toISOString(),
  },
  { onConflict: "key" },
);

if (error) {
  console.error("Upsert fallito:", error.message);
  process.exit(1);
}

console.log("OK — booking_operational_week_schedule aggiornato in produzione.");
