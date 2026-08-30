#!/usr/bin/env bash
# MusicPro School — TestFlight via Xcode tools (niente EAS / Expo cloud).
#
# Expo qui NON è runtime di distribuzione: serve solo a generare/aggiornare
# il progetto nativo iOS in locale (`expo prebuild`). Ship = xcodebuild + ASC.
# Expo Go e EAS Build sono deprecati. Doc: docs/MOBILE_TESTFLIGHT.md
#
# Flusso:
#   expo prebuild (toolchain) → xcodebuild archive → export IPA → App Store Connect
#
# Uso (path documentato = root):
#   npm run testflight
#   ./scripts/testflight.sh
#   ./scripts/testflight.sh --prebuild   # forza expo prebuild locale
#
# Variabili (musicpro/.env):
#   APPLE_TEAM_ID          default YSU7PL673A
#   IOS_BUNDLE_ID          default it.musicproeventi.school
#   IOS_BUILD_NUMBER       default timestamp
#   APPLE_API_KEY_ID / APPLE_API_ISSUER_ID / APPLE_API_KEY_PATH
#                          se presenti: upload con API key (altool)
#   altrimenti: upload con sessione Xcode (destination=upload)

set -euo pipefail

REAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# RN 0.76 script phases non quotano i path: lo spazio in "MusicPro School"
# rompe Hermes, ReactCodegen, fmt. Cloniamo musicpro in un path senza spazi.
BUILD_TREE="/tmp/mps-tf-build"
ROOT="$REAL_ROOT"
FORCE_PREBUILD=0
if [[ "${1:-}" == "--prebuild" ]]; then
  FORCE_PREBUILD=1
fi

BUNDLE_ID="it.musicproeventi.school"
TEAM_ID="YSU7PL673A"
SCHEME=""
WORKSPACE=""

note() { printf '    %s\n' "$*"; }
ok()   { printf '    OK  %s\n' "$*"; }
die()  { printf '\nERRORE: %s\n' "$*" >&2; exit 1; }

step() { printf '\n==> %s\n' "$*"; }

read_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Manca il comando: $1"
}

write_export_options() {
  # $1 = destination: export | upload
  local method_dest="${1:-export}"
  cat > "$DIST/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>${method_dest}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
EOF
}

cd "$ROOT"

export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-$(read_env_value "$ROOT/musicpro/.env" EXPO_PUBLIC_SUPABASE_URL)}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-$(read_env_value "$ROOT/musicpro/.env" EXPO_PUBLIC_SUPABASE_ANON_KEY)}"
export EXPO_PUBLIC_WEB_URL="${EXPO_PUBLIC_WEB_URL:-$(read_env_value "$ROOT/musicpro/.env" EXPO_PUBLIC_WEB_URL)}"
export EXPO_PUBLIC_WEB_URL="${EXPO_PUBLIC_WEB_URL:-https://school.musicproeventi.it}"

TEAM_ID="$(read_env_value "$ROOT/musicpro/.env" APPLE_TEAM_ID)"
TEAM_ID="${TEAM_ID:-YSU7PL673A}"
BUNDLE_ID="$(read_env_value "$ROOT/musicpro/.env" IOS_BUNDLE_ID)"
BUNDLE_ID="${BUNDLE_ID:-it.musicproeventi.school}"
BUILD_NUMBER="$(read_env_value "$ROOT/musicpro/.env" IOS_BUILD_NUMBER)"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
API_KEY_ID="$(read_env_value "$ROOT/musicpro/.env" APPLE_API_KEY_ID)"
API_ISSUER="$(read_env_value "$ROOT/musicpro/.env" APPLE_API_ISSUER_ID)"
API_KEY_PATH="$(read_env_value "$ROOT/musicpro/.env" APPLE_API_KEY_PATH)"
# Fallback globale Mac (ReWavier / tutte le app): ~/.app-store/asc-api/key.env
ASC_GLOBAL="$HOME/.app-store/asc-api/key.env"
if [[ -z "$API_KEY_ID" || -z "$API_ISSUER" || -z "$API_KEY_PATH" ]] && [[ -f "$ASC_GLOBAL" ]]; then
  API_KEY_ID="${API_KEY_ID:-$(read_env_value "$ASC_GLOBAL" ASC_KEY_ID)}"
  API_KEY_ID="${API_KEY_ID:-$(read_env_value "$ASC_GLOBAL" APPLE_API_KEY_ID)}"
  API_ISSUER="${API_ISSUER:-$(read_env_value "$ASC_GLOBAL" ASC_ISSUER_ID)}"
  API_ISSUER="${API_ISSUER:-$(read_env_value "$ASC_GLOBAL" APPLE_API_ISSUER_ID)}"
  API_KEY_PATH="${API_KEY_PATH:-$(read_env_value "$ASC_GLOBAL" ASC_KEY_PATH)}"
  API_KEY_PATH="${API_KEY_PATH:-$(read_env_value "$ASC_GLOBAL" APPLE_API_KEY_PATH)}"
  note "ASC API key da $ASC_GLOBAL"
fi

step "Preflight Xcode tools"
need_cmd xcodebuild
need_cmd xcrun
need_cmd pod
need_cmd rsync
xcodebuild -version
ok "Xcode + CocoaPods · team $TEAM_ID · bundle $BUNDLE_ID · build $BUILD_NUMBER"

step "Copia senza spazi → $BUILD_TREE"
mkdir -p "$BUILD_TREE"
rsync -a --delete \
  --exclude '/apps/web/.next' \
  --exclude '/apps/mobile/dist-ios' \
  --exclude '/apps/mobile/ios/build' \
  "$REAL_ROOT/musicpro/" "$BUILD_TREE/"
MOBILE="$BUILD_TREE/apps/mobile"
DIST="$MOBILE/dist-ios"
XCODE_IOS="$MOBILE/ios"
ok "build tree pronta"

step "Icona 1024×1024"
if [[ ! -f "$MOBILE/assets/icon.png" ]]; then
  mkdir -p "$MOBILE/assets"
  if [[ -f "$REAL_ROOT/assets/music-pro-logo.png" ]]; then
    sips --padToHeightWidth 1024 1024 --padColor 1E3A5F \
      "$REAL_ROOT/assets/music-pro-logo.png" \
      --out "$MOBILE/assets/icon.png" >/dev/null
  elif [[ -f "$REAL_ROOT/musicpro/apps/mobile/assets/icon.png" ]]; then
    cp "$REAL_ROOT/musicpro/apps/mobile/assets/icon.png" "$MOBILE/assets/icon.png"
  fi
fi
ok "$MOBILE/assets/icon.png"

patch_ios_podfile() {
  MUSICPRO_PODFILE="$MOBILE/ios/Podfile" python3 - <<'PY'
from pathlib import Path
import os
p = Path(os.environ["MUSICPRO_PODFILE"])
text = p.read_text()
hook = """
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
      end
    end
"""
if "ENABLE_USER_SCRIPT_SANDBOXING" in text:
    raise SystemExit(0)
needle = """    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )
"""
if needle not in text:
    raise SystemExit("Podfile: blocco react_native_post_install non trovato")
p.write_text(text.replace(needle, needle + hook, 1))
print("Podfile patched")
PY
}

# fmt 11.0.2 always #define FMT_USE_CONSTEVAL (ignores -D). Xcode 26 Clang
# then fails on FMT_STRING(...). Force the two "enable" branches to 0.
patch_fmt_consteval() {
  local hdr="$MOBILE/ios/Pods/fmt/include/fmt/base.h"
  [[ -f "$hdr" ]] || return 0
  chmod u+w "$hdr" || true
  MUSICPRO_FMT_BASE="$hdr" python3 - <<'PY'
from pathlib import Path
import os
p = Path(os.environ["MUSICPRO_FMT_BASE"])
text = p.read_text()
# undo a previous broken "#if 0" wrap if present
broken = "#define FMT_USE_CONSTEVAL 0 /* MUSICPRO_FMT_CONSTEVAL_OFF */\n#if 0\n"
text = text.replace(broken, "")
if "MUSICPRO_FMT_CONSTEVAL_OFF" in text:
    p.write_text(text)
    raise SystemExit(0)
if "#  define FMT_USE_CONSTEVAL 1" not in text:
    raise SystemExit("fmt/base.h: FMT_USE_CONSTEVAL 1 non trovato")
text = text.replace(
    "#  define FMT_USE_CONSTEVAL 1",
    "#  define FMT_USE_CONSTEVAL 0 /* MUSICPRO_FMT_CONSTEVAL_OFF */",
)
p.write_text(text)
print("fmt consteval disabled")
PY
}

step "Progetto iOS nativo (locale, niente EAS)"
if [[ "$FORCE_PREBUILD" -eq 1 || ! -d "$MOBILE/ios" ]]; then
  need_cmd npx
  (
    cd "$MOBILE"
    EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --non-interactive
  )
  ok "ios/ generato con expo prebuild locale + pod install"
  patch_ios_podfile
  (cd "$MOBILE/ios" && pod install)
else
  note "ios/ già presente — salto prebuild (usa --prebuild per rigenerare)"
  patch_ios_podfile
  # Sempre pod install nel clone: riscrive i path assoluti (niente spazi).
  (cd "$MOBILE/ios" && pod install)
  ok "ios/ pronto"
fi

WORKSPACE="$(find "$XCODE_IOS" -maxdepth 1 -name '*.xcworkspace' | head -1)"
[[ -n "$WORKSPACE" ]] || die "Nessun .xcworkspace in $MOBILE/ios"
SCHEME="$(basename "$WORKSPACE" .xcworkspace)"
ok "workspace $(basename "$WORKSPACE") · scheme $SCHEME"

step "Build number $BUILD_NUMBER"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" \
  "$MOBILE/ios/$SCHEME/Info.plist" 2>/dev/null \
  || note "CFBundleVersion gestito da Xcode/Expo (CURRENT_PROJECT_VERSION)"
# Expo 52 often uses CURRENT_PROJECT_VERSION in the pbxproj / marketing version
xcrun agvtool new-version -all "$BUILD_NUMBER" 2>/dev/null \
  || true
(
  cd "$MOBILE/ios"
  xcrun agvtool new-version -all "$BUILD_NUMBER" >/dev/null 2>&1 || true
)

mkdir -p "$DIST"
ARCHIVE="$DIST/MusicProSchool.xcarchive"
IPA_DIR="$DIST/export"

step "NODE_BINARY per script phases Xcode"
NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || die "node non trovato nel PATH"
# Preferisci il symlink brew stabile (le versioni Cellar cambiano e rompono .xcode.env.local).
if [[ -x /opt/homebrew/bin/node ]]; then
  NODE_BIN=/opt/homebrew/bin/node
fi
printf 'export NODE_BINARY=%s\n' "$NODE_BIN" > "$MOBILE/ios/.xcode.env.local"
ok "NODE_BINARY=$NODE_BIN"

step "Hermes Release (tar quotato: il path ha uno spazio)"
# replace_hermes_version.js di RN 0.76 non quota il path → fallisce su "MusicPro School".
HERMES_PODS="$MOBILE/ios/Pods"
HERMES_TGZ="$HERMES_PODS/hermes-engine-artifacts/hermes-ios-0.76.9-release.tar.gz"
if [[ -f "$HERMES_TGZ" ]]; then
  rm -rf "$HERMES_PODS/hermes-engine"
  mkdir -p "$HERMES_PODS/hermes-engine"
  tar -xf "$HERMES_TGZ" -C "$HERMES_PODS/hermes-engine"
  printf 'Release' > "$HERMES_PODS/.last_build_configuration"
  ok "hermes-engine Release estratto"
else
  note "tarball Hermes non trovato, provo comunque l'archive"
fi
patch_fmt_consteval
ok "fmt: consteval disattivato (Xcode 26)"

step "Archive Release (xcodebuild, automatic signing)"
rm -rf "$ARCHIVE" "$IPA_DIR"
mkdir -p "$IPA_DIR"
DERIVED="/tmp/mps-dd"

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  archive \
  | tee /tmp/mps-archive.log | tail -40

[[ -d "$ARCHIVE" ]] || die "Archive non creato: $ARCHIVE"
ok "archive $ARCHIVE"

step "Export IPA (xcodebuild, niente EAS)"
# Xcode CLI su questo Mac spesso non vede gli Accounts → export automatico fallisce.
# Preferiamo firma manuale con profilo App Store (sigh / Developer Portal).
PROFILE_NAME="${IOS_PROFILE_NAME:-${BUNDLE_ID} AppStore}"
cat > "$DIST/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>Apple Distribution</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${BUNDLE_ID}</key>
    <string>${PROFILE_NAME}</string>
  </dict>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
EOF
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$DIST/ExportOptions.plist" \
  | tee /tmp/mps-export.log | tail -20
IPA="$(find "$IPA_DIR" -name '*.ipa' | head -1)"
[[ -n "$IPA" ]] || die "IPA non trovato in $IPA_DIR"
ok "IPA $IPA"

if [[ -n "$API_KEY_ID" && -n "$API_ISSUER" && -n "$API_KEY_PATH" ]]; then
  [[ -f "$API_KEY_PATH" ]] || die "APPLE_API_KEY_PATH non trovato: $API_KEY_PATH"
  step "Upload TestFlight (App Store Connect API)"
  # altool cerca AuthKey_<KEY_ID>.p8 in cwd o in ~/.private_keys / ~/private_keys
  API_KEY_DIR="$(cd "$(dirname "$API_KEY_PATH")" && pwd)"
  API_KEY_FILE="$(basename "$API_KEY_PATH")"
  if [[ "$API_KEY_FILE" != "AuthKey_${API_KEY_ID}.p8" ]]; then
    note "altool si aspetta AuthKey_${API_KEY_ID}.p8 (file attuale: $API_KEY_FILE)"
  fi
  (
    cd "$API_KEY_DIR"
    xcrun altool --upload-app \
      --type ios \
      --file "$IPA" \
      --apiKey "$API_KEY_ID" \
      --apiIssuer "$API_ISSUER"
  )
  ok "caricato $IPA su TestFlight (API key)"
else
  step "Upload TestFlight (sessione Xcode)"
  write_export_options upload
  set +e
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportPath "$IPA_DIR" \
    -exportOptionsPlist "$DIST/ExportOptions.plist" \
    -allowProvisioningUpdates \
    | tee /tmp/mps-upload.log | tail -25
  up_rc=${PIPESTATUS[0]}
  set -e
  if [[ "$up_rc" -eq 0 ]]; then
    ok "caricato su App Store Connect / TestFlight"
  elif grep -q 'missingApp\|Error Downloading App Information' /tmp/mps-upload.log; then
    die "L'app $BUNDLE_ID non esiste su App Store Connect. Creala una volta (iOS, stesso bundle id) e rilancia npm run testflight. IPA già pronto: $IPA"
  elif grep -qi 'No Accounts\|Failed to Use Accounts\|app-specific password' /tmp/mps-upload.log; then
    die "Upload bloccato: manca la App Store Connect API Key. In musicpro/.env imposta APPLE_API_KEY_ID, APPLE_API_ISSUER_ID, APPLE_API_KEY_PATH (file AuthKey_*.p8), poi rilancia. IPA già pronto: $IPA"
  else
    die "Upload TestFlight fallito. Log: /tmp/mps-upload.log — IPA: $IPA"
  fi
fi

REAL_DIST="$REAL_ROOT/musicpro/apps/mobile/dist-ios"
mkdir -p "$REAL_DIST"
rsync -a "$DIST/" "$REAL_DIST/" 2>/dev/null || true
note "Apri TestFlight su App Store Connect: bundle $BUNDLE_ID"
note "La build $BUILD_NUMBER compare dopo il processing Apple (spesso 5–15 min)."
note "IPA/archive anche in $REAL_DIST"
