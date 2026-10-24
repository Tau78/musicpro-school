#!/usr/bin/env bash
# Build release AAB for Play (requires Android SDK + JDK 17+).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# AGP 8.x wants JDK 17 (not Homebrew openjdk 27+).
if [[ -x /opt/homebrew/opt/openjdk@17/bin/java ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
elif [[ -x /opt/homebrew/opt/openjdk/bin/java ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk"
fi
export PATH="${JAVA_HOME}/bin:${PATH:-}"
: "${ANDROID_HOME:?Imposta ANDROID_HOME (SDK Android)}"
if [[ ! -f gradlew ]]; then
  echo "Manca gradle wrapper. Genera con: gradle wrapper --gradle-version 8.11.1" >&2
  exit 1
fi
echo "JAVA_HOME=$JAVA_HOME ($("$JAVA_HOME/bin/java" -version 2>&1 | head -1))"
./gradlew :app:bundleRelease
echo "AAB: $ROOT/app/build/outputs/bundle/release/app-release.aab"
