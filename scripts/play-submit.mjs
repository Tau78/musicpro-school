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
 * Exit codes:
 *   0 = ok
 *   1 = other failure (SA missing, AAB missing, API error, …)
 *   2 = package missing in Play Console (create the app first)
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

const STABLE_AAB = resolve(
  homedir(),
  ".config/musicpro-school/dist/musicpro-school-1.1.0-1.aab",
);
const BUILD_AAB = resolve(
  ROOT,
  "school-shell-android/app/build/outputs/bundle/release/app-release.aab",
);

function resolveAab() {
  if (process.env.PLAY_AAB) return process.env.PLAY_AAB;
  if (existsSync(STABLE_AAB)) return STABLE_AAB;
  return BUILD_AAB;
}

const AAB = resolveAab();

/** Exit 2: package not in Play Console yet — short Italian steps from PLAY_FIRST_PUBLISH.md */
function printPackageMissingSteps() {
  console.error("\nPackage non trovato in Play Console. Crea l’app (una tantum):");
  console.error("1. Play Console → Crea app (MusicPro School, IT, App, Gratis)");
  console.error(
    "2. Utenti e autorizzazioni → invita musicpro-play-submit@rewavier-app.iam.gserviceaccount.com (Release)",
  );
  console.error("3. Impostazioni app → Privacy policy URL + Data safety");
  console.error("4. Classificazione contenuti (questionario IARC)");
  console.error("Dettagli: store/android/PLAY_FIRST_PUBLISH.md");
}

function isPackageMissingError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  const code = err?.code ?? err?.response?.status;
  if (code === 404) return true;
  // Android Publisher when the app was never created
  if (msg.includes("package not found") || msg.includes("app not found")) return true;
  if (msg.includes("the caller does not have permission") && msg.includes("package")) return true;
  // Common API wording when packageName has no Play listing yet
  if (/\b404\b/.test(msg) && (msg.includes("package") || msg.includes("not found"))) return true;
  return false;
}

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
    if (isPackageMissingError(e)) {
      printPackageMissingSteps();
      process.exit(2);
    }
    console.error("Vedi store/android/PLAY_FIRST_PUBLISH.md");
    process.exit(1);
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
