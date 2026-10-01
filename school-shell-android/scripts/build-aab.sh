#!/usr/bin/env bash
# Build release AAB for Play (requires Android SDK + JDK 17+).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/openjdk/bin:${PATH:-}"
: "${ANDROID_HOME:?Imposta ANDROID_HOME (SDK Android)}"
if [[ ! -f gradlew ]]; then
  echo "Manca gradle wrapper. Genera con: gradle wrapper --gradle-version 8.11.1" >&2
  exit 1
fi
./gradlew :app:bundleRelease
echo "AAB: $ROOT/app/build/outputs/bundle/release/app-release.aab"
