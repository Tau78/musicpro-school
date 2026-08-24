#!/usr/bin/env node
/**
 * Smoke test for Documenti section (Libro Associati HTML, Cespiti DB, settings).
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

async function main() {
  if (!url || !key) {
    fail("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  const supabase = createClient(url, key);

  const { count, error: countErr } = await supabase
    .from("fixed_assets")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    fail(`fixed_assets query: ${countErr.message}`);
  } else if ((count ?? 0) < 1) {
    fail(`fixed_assets empty (count=${count}) — run npm run import:cespiti`);
  } else {
    ok(`fixed_assets has ${count} rows`);
  }

  const settingKeys = [
    "documenti_segreteria_libro_associati",
    "documenti_segreteria_verbali",
    "documenti_segreteria_libro_cespiti",
  ];

  const { data: settings, error: settingsErr } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", settingKeys);

  if (settingsErr) {
    fail(`app_settings: ${settingsErr.message}`);
  } else {
    const found = new Set((settings ?? []).map((s) => s.key));
    for (const k of settingKeys) {
      if (!found.has(k)) fail(`missing app_settings key: ${k}`);
      else ok(`app_settings.${k} present`);
    }
  }

  const { data: sample, error: sampleErr } = await supabase
    .from("fixed_assets")
    .select("id, name, location_preset, quantity")
    .is("deleted_at", null)
    .limit(5);

  if (sampleErr) {
    fail(`sample assets: ${sampleErr.message}`);
  } else if (!sample?.length) {
    fail("no sample assets");
  } else {
    ok(`sample assets: ${sample.map((a) => a.name).join(", ")}`);
  }

  // HTML builders (dynamic import from compiled TS not available — inline checks)
  const associatesPath = path.join(
    rootDir,
    "musicpro/apps/web/src/lib/documenti/associates-book-html.ts",
  );
  const cespitiPath = path.join(
    rootDir,
    "musicpro/apps/web/src/lib/documenti/cespiti-book-html.ts",
  );
  const fs = await import("fs");
  const associatesSrc = fs.readFileSync(associatesPath, "utf8");
  const cespitiSrc = fs.readFileSync(cespitiPath, "utf8");

  if (!associatesSrc.includes("column-count: 2")) {
    fail("associates-book-html missing 2-column layout");
  } else {
    ok("associates-book-html 2-column layout");
  }

  if (!cespitiSrc.includes("buildCespitiBookHtml")) {
    fail("cespiti-book-html missing buildCespitiBookHtml");
  } else {
    ok("cespiti-book-html export builder present");
  }

  if (process.exitCode) {
    console.error("\nSmoke documenti: FAILED");
  } else {
    console.log("\nSmoke documenti: PASSED");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
