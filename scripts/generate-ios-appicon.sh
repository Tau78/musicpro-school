#!/usr/bin/env bash
# Build a complete iOS AppIcon.appiconset from the Expo brand icon.
# Source of truth: musicpro/apps/mobile/assets/icon.png (1024×1024, no alpha).
#
# Usage:
#   ./scripts/generate-ios-appicon.sh
#   ./scripts/generate-ios-appicon.sh /path/to/apps/mobile
#
# Called by testflight.sh after expo prebuild / when ios/ already exists.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="${1:-$ROOT/musicpro/apps/mobile}"
SRC="$MOBILE/assets/icon.png"
ICONSET="$MOBILE/ios/MusicProSchool/Images.xcassets/AppIcon.appiconset"

die() { printf 'ERRORE generate-ios-appicon: %s\n' "$*" >&2; exit 1; }

[[ -f "$SRC" ]] || die "manca $SRC"
[[ -d "$MOBILE/ios" ]] || die "manca $MOBILE/ios (esegui expo prebuild prima)"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/mps-appicon.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

MASTER="$TMP/master-1024.png"

# Flatten to opaque RGB (#1e3a5f) — App Store marketing icon rejects alpha.
set +e
python3 - "$SRC" "$MASTER" <<'PY'
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
try:
    from PIL import Image
except ImportError:
    # Fallback: sips JPEG round-trip (caller will run it)
    raise SystemExit(2)

im = Image.open(src).convert("RGBA")
if im.size != (1024, 1024):
    im = im.resize((1024, 1024), Image.Resampling.LANCZOS)
bg = Image.new("RGBA", im.size, (30, 58, 95, 255))
Image.alpha_composite(bg, im).convert("RGB").save(out, format="PNG", optimize=True)
print("opaque", out)
PY
pil_status=$?
set -e
if [[ "$pil_status" -eq 2 ]]; then
  # No Pillow: drop alpha via JPEG intermediate then force 1024.
  sips -s format jpeg "$SRC" --out "$TMP/flat.jpg" >/dev/null
  sips -s format png -z 1024 1024 "$TMP/flat.jpg" --out "$MASTER" >/dev/null
elif [[ "$pil_status" -ne 0 ]]; then
  die "flatten icon fallito"
fi

# Keep Expo source opaque 1024 (App Store + prebuild input).
cp "$MASTER" "$SRC"

rm -rf "$ICONSET"
mkdir -p "$ICONSET"
cp "$MASTER" "$ICONSET/Icon-1024.png"

# px:filename — all required iPhone + iPad (supportsTablet) + App Store 1024
SIZES=(
  "20:Icon-20.png"
  "40:Icon-20@2x.png"
  "60:Icon-20@3x.png"
  "29:Icon-29.png"
  "58:Icon-29@2x.png"
  "87:Icon-29@3x.png"
  "40:Icon-40.png"
  "80:Icon-40@2x.png"
  "120:Icon-40@3x.png"
  "120:Icon-60@2x.png"
  "180:Icon-60@3x.png"
  "76:Icon-76.png"
  "152:Icon-76@2x.png"
  "167:Icon-83.5@2x.png"
)

for entry in "${SIZES[@]}"; do
  px="${entry%%:*}"
  name="${entry#*:}"
  sips -z "$px" "$px" "$MASTER" --out "$ICONSET/$name" >/dev/null
done

cat > "$ICONSET/Contents.json" <<'EOF'
{
  "images": [
    { "idiom": "iphone", "size": "20x20", "scale": "2x", "filename": "Icon-20@2x.png" },
    { "idiom": "iphone", "size": "20x20", "scale": "3x", "filename": "Icon-20@3x.png" },
    { "idiom": "iphone", "size": "29x29", "scale": "2x", "filename": "Icon-29@2x.png" },
    { "idiom": "iphone", "size": "29x29", "scale": "3x", "filename": "Icon-29@3x.png" },
    { "idiom": "iphone", "size": "40x40", "scale": "2x", "filename": "Icon-40@2x.png" },
    { "idiom": "iphone", "size": "40x40", "scale": "3x", "filename": "Icon-40@3x.png" },
    { "idiom": "iphone", "size": "60x60", "scale": "2x", "filename": "Icon-60@2x.png" },
    { "idiom": "iphone", "size": "60x60", "scale": "3x", "filename": "Icon-60@3x.png" },
    { "idiom": "ipad", "size": "20x20", "scale": "1x", "filename": "Icon-20.png" },
    { "idiom": "ipad", "size": "20x20", "scale": "2x", "filename": "Icon-20@2x.png" },
    { "idiom": "ipad", "size": "29x29", "scale": "1x", "filename": "Icon-29.png" },
    { "idiom": "ipad", "size": "29x29", "scale": "2x", "filename": "Icon-29@2x.png" },
    { "idiom": "ipad", "size": "40x40", "scale": "1x", "filename": "Icon-40.png" },
    { "idiom": "ipad", "size": "40x40", "scale": "2x", "filename": "Icon-40@2x.png" },
    { "idiom": "ipad", "size": "76x76", "scale": "1x", "filename": "Icon-76.png" },
    { "idiom": "ipad", "size": "76x76", "scale": "2x", "filename": "Icon-76@2x.png" },
    { "idiom": "ipad", "size": "83.5x83.5", "scale": "2x", "filename": "Icon-83.5@2x.png" },
    { "idiom": "ios-marketing", "size": "1024x1024", "scale": "1x", "filename": "Icon-1024.png" }
  ],
  "info": { "version": 1, "author": "xcode" }
}
EOF

# Sanity: every Contents.json filename exists and marketing has no alpha
python3 - "$ICONSET" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
data = json.loads((p / "Contents.json").read_text())
missing = [i["filename"] for i in data["images"] if not (p / i["filename"]).is_file()]
if missing:
    raise SystemExit(f"AppIcon missing files: {missing}")
print(f"AppIcon OK ({len(data['images'])} slots) → {p}")
PY

# Prefer sips check for alpha on marketing icon
alpha="$(sips -g hasAlpha "$ICONSET/Icon-1024.png" 2>/dev/null | awk '/hasAlpha/ {print $2}')"
[[ "$alpha" == "no" ]] || die "Icon-1024.png ha ancora alpha (App Store la rifiuta)"
ok_msg="AppIcon.appiconset generato da $SRC"
printf '    OK  %s\n' "$ok_msg"
