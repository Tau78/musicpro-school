#!/usr/bin/env node
/**
 * Upload a signed AAB to Google Play (Android Publisher API).
 * Does NOT create the Play Console app — that is a one-time Console step.
 *
 * Usage:
 *   node scripts/play-submit.mjs                 # dry-run: check SA + package
 *   PLAY_TRACK=internal node scripts/play-submit.mjs --yes
 *   PLAY_TRACK=production node scripts/play-submit.mjs --yes
 *
 * Secrets (never commit):
 *   ~/.config/rewavier/play-service-account.json
 *   or PLAY_SERVICE_ACCOUNT_JSON / ./google-play-service-account.json
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { google } from "googleapis";

const PACKAGE = process.env.PLAY_PACKAGE || "it.musicproeventi.school";
const TRACK = process.env.PLAY_TRACK || "internal";
const STATUS = process.env.PLAY_STATUS || (TRACK === "production" ? "draft" : "completed");
const DO_UPLOAD = process.argv.includes("--yes") || process.env.PLAY_SUBMIT === "1";
const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_AAB = resolve(
  ROOT,
  "school-shell-android/app/build/outputs/bundle/release/app-release.aab",
);
const AAB = process.env.PLAY_AAB || DEFAULT_AAB;

function resolveSaPath() {
  const candidates = [
    process.env.PLAY_SERVICE_ACCOUNT_JSON,
    resolve(ROOT, "google-play-service-account.json"),
    resolve(homedir(), ".config/rewavier/play-service-account.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const saPath = resolveSaPath();
  if (!saPath) {
    console.error("Manca Play service account JSON.");
    process.exit(1);
  }
  console.log("SA:", saPath);
  console.log("package:", PACKAGE);
  console.log("track:", TRACK, "status:", STATUS);
  console.log("aab:", AAB, existsSync(AAB) ? "(ok)" : "(MISSING)");
  console.log("mode:", DO_UPLOAD ? "UPLOAD" : "DRY-RUN");

  const auth = new google.auth.GoogleAuth({
    keyFile: saPath,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth });

  let edit;
  try {
    edit = await androidpublisher.edits.insert({ packageName: PACKAGE, requestBody: {} });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("\nImpossibile aprire un edit su", PACKAGE);
    console.error(msg.slice(0, 500));
    console.error(
      "\nSe l’app non esiste ancora: creala in Play Console, invita",
      "musicpro-play-submit@rewavier-app.iam.gserviceaccount.com",
      "con permesso Release, poi rilancia.",
    );
    console.error("Vedi store/android/PLAY_FIRST_PUBLISH.md");
    process.exit(2);
  }
  const editId = edit.data.id;
  console.log("edit:", editId);

  if (!DO_UPLOAD) {
    await androidpublisher.edits.delete({ packageName: PACKAGE, editId });
    console.log("\nDRY-RUN ok — app raggiungibile via API. Per caricare: --yes");
    return;
  }

  if (!existsSync(AAB)) {
    console.error("Manca AAB. Esegui: npm run android:aab");
    await androidpublisher.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});
    process.exit(1);
  }

  const bundle = await androidpublisher.edits.bundles.upload({
    packageName: PACKAGE,
    editId,
    media: {
      mimeType: "application/octet-stream",
      body: readFileSync(AAB),
    },
  });
  const versionCode = bundle.data.versionCode;
  console.log("uploaded versionCode:", versionCode);

  await androidpublisher.edits.tracks.update({
    packageName: PACKAGE,
    editId,
    track: TRACK,
    requestBody: {
      track: TRACK,
      releases: [
        {
          name: `1.1.0 (${versionCode})`,
          versionCodes: [String(versionCode)],
          status: STATUS,
        },
      ],
    },
  });
  console.log("track updated:", TRACK, STATUS);

  const commit = await androidpublisher.edits.commit({ packageName: PACKAGE, editId });
  console.log("committed:", commit.data.id || editId);
  console.log("\nOK — controlla Play Console → Release →", TRACK);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
