#!/bin/bash
# Pulizia bounce Gmail → svuota email associati MusicPro School (non cancella anagrafica).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/scripts/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/bounce-gmail-daily.log"
{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  /opt/homebrew/bin/node scripts/process-gmail-bounces.mjs --imap --apply
} >>"$LOG" 2>&1
