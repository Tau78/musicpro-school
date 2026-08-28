#!/usr/bin/env node
/**
 * Smoke test: upload photo to a fixed_asset via service role (same path as API).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("FAIL: missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, key);

// 1x1 red PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  const { data: asset, error: pickErr } = await supabase
    .from("fixed_assets")
    .select("id, name, photo_storage_path")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (pickErr || !asset) {
    console.error("FAIL: no asset", pickErr?.message);
    process.exit(1);
  }

  const storagePath = `assets/${asset.id}/smoke-test.png`;

  const { error: uploadErr } = await supabase.storage
    .from("fixed_assets")
    .upload(storagePath, PNG, { contentType: "image/png", upsert: true });

  if (uploadErr) {
    console.error("FAIL: storage upload", uploadErr.message);
    process.exit(1);
  }
  console.log("OK: storage upload", storagePath);

  const { error: updateErr } = await supabase
    .from("fixed_assets")
    .update({ photo_storage_path: storagePath })
    .eq("id", asset.id);

  if (updateErr) {
    console.error("FAIL: db update", updateErr.message);
    process.exit(1);
  }
  console.log("OK: db photo_storage_path updated for", asset.name);

  const { data: signed, error: signErr } = await supabase.storage
    .from("fixed_assets")
    .createSignedUrl(storagePath, 300);

  if (signErr || !signed?.signedUrl) {
    console.error("FAIL: signed url", signErr?.message);
    process.exit(1);
  }
  console.log("OK: signed URL generated");

  console.log("\nSmoke photo upload: PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
