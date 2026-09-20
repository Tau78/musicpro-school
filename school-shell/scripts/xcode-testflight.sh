#!/usr/bin/env bash
# Guscio nativo MusicPro School (WKWebView → dashboard) → TestFlight.
# Xcode locale, niente Expo/EAS. Non è Submit for Review.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPLOAD=1
BUMP=1
for arg in "$@"; do
  case "$arg" in
    --no-upload) UPLOAD=0 ;;
    --no-bump) BUMP=0 ;;
    *)
      echo "Uso: bash scripts/xcode-testflight.sh [--no-upload] [--no-bump]"
      exit 2
      ;;
  esac
done

TEAM_ID="YSU7PL673A"
BUNDLE_ID="it.musicproeventi.school"
SCHEME="MusicProSchool"
PROJECT="MusicProSchool.xcodeproj"
ARCHIVE="$ROOT/build/MusicProSchool.xcarchive"
IPA_DIR="$ROOT/build/ipa"
EXPORT_PLIST="$ROOT/build/ExportOptions.plist"
ASC_APP_ID="6806407450"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"

load_asc_api() {
  if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_KEY_PATH:-}" ]]; then
    return 0
  fi
  if [[ -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER_ID:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
    ASC_KEY_ID="$APPLE_API_KEY_ID"
    ASC_ISSUER_ID="$APPLE_API_ISSUER_ID"
    ASC_KEY_PATH="$APPLE_API_KEY_PATH"
    return 0
  fi
  local key_env="$HOME/.app-store/asc-api/key.env"
  if [[ -f "$key_env" ]]; then
    # shellcheck disable=SC1090
    set -a
    # shellcheck source=/dev/null
    source "$key_env"
    set +a
  fi
  ASC_KEY_ID="${ASC_KEY_ID:-${APPLE_API_KEY_ID:-}}"
  ASC_ISSUER_ID="${ASC_ISSUER_ID:-${APPLE_API_ISSUER_ID:-}}"
  ASC_KEY_PATH="${ASC_KEY_PATH:-${APPLE_API_KEY_PATH:-}}"
  [[ -n "$ASC_KEY_ID" && -n "$ASC_ISSUER_ID" && -n "$ASC_KEY_PATH" && -f "$ASC_KEY_PATH" ]]
}

if [[ "$BUMP" == "1" ]]; then
  echo "→ Incremento build number"
  (cd "$ROOT" && xcrun agvtool next-version -all >/dev/null) || true
fi

VERSION="$(xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showBuildSettings 2>/dev/null | awk '/MARKETING_VERSION / {print $3; exit}')"
BUILD_NUM="$(xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showBuildSettings 2>/dev/null | awk '/CURRENT_PROJECT_VERSION / {print $3; exit}')"
VERSION="${VERSION:-1.1.0}"
BUILD_NUM="${BUILD_NUM:-1}"

# Se agvtool non ha bumpato (progetto senza VERSIONING_SYSTEM attivo in cwd), forza timestamp.
if [[ "$BUMP" == "1" && "$BUILD_NUM" == "1" ]]; then
  BUILD_NUM="$(date +%Y%m%d%H%M)"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUM" \
    "$ROOT/MusicProSchool/Info.plist" 2>/dev/null || true
  # Patch CURRENT_PROJECT_VERSION in pbxproj
  python3 - <<PY
from pathlib import Path
p = Path("$ROOT/$PROJECT/project.pbxproj")
text = p.read_text()
import re
text2, n = re.subn(
    r"CURRENT_PROJECT_VERSION = [^;]+;",
    f"CURRENT_PROJECT_VERSION = {BUILD_NUM};",
    text,
)
if n:
    p.write_text(text2)
    print(f"pbxproj build → {BUILD_NUM} ({n} occ)")
PY
fi

mkdir -p "$ROOT/build" "$IPA_DIR"

cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
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

DESTINATION="generic/platform=iOS"

echo "→ Archive (Release) $VERSION ($BUILD_NUM) team $TEAM_ID bundle $BUNDLE_ID"
rm -rf "$ARCHIVE"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "$DESTINATION" \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUM" \
  MARKETING_VERSION="$VERSION" \
  -allowProvisioningUpdates \
  archive

if [[ "$UPLOAD" == "0" ]]; then
  echo ""
  echo "Archivio pronto: $ARCHIVE (upload saltato)."
  exit 0
fi

echo "→ Export IPA"
rm -rf "$IPA_DIR"
mkdir -p "$IPA_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

IPA="$(find "$IPA_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
if [[ -z "$IPA" ]]; then
  echo "Nessun IPA in $IPA_DIR" >&2
  exit 1
fi

if ! load_asc_api; then
  echo "Manca la chiave ASC (~/.app-store/asc-api/key.env). Non posso caricare su TestFlight." >&2
  exit 1
fi

mkdir -p "$HOME/.appstoreconnect/private_keys"
KEY_DEST="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
if [[ ! -e "$KEY_DEST" ]] || ! cmp -s "$ASC_KEY_PATH" "$KEY_DEST" 2>/dev/null; then
  cp -f "$ASC_KEY_PATH" "$KEY_DEST"
fi

echo "→ Upload to App Store Connect (API key $ASC_KEY_ID)"
xcrun altool --upload-app --type ios --file "$IPA" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "→ Assegno build $BUILD_NUM al gruppo Test (tester andreoni.mauro@gmail.com)"
if [[ -f "$REPO_ROOT/scripts/asc-assign-testflight.mjs" ]]; then
  node "$REPO_ROOT/scripts/asc-assign-testflight.mjs" "$BUILD_NUM" || \
    echo "Avviso: upload ok, ma il gruppo Test non ha ancora la $BUILD_NUM. Riprova: node scripts/asc-assign-testflight.mjs $BUILD_NUM" >&2
else
  echo "Avviso: manca scripts/asc-assign-testflight.mjs — assegna a mano la build al gruppo Test." >&2
fi

echo ""
echo "Fatto. Tra 5–15 minuti controlla TestFlight (build $BUILD_NUM, version $VERSION)."
echo "https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/testflight/ios"
echo "Non è Submit for Review."
