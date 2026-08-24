#!/usr/bin/env bash
# Template: crea .cursor/environment.json per My Machines (iPhone).
# Copiato in scripts/cursor-worker-setup.sh al setup VAI di un repo nuovo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:${PATH:-/usr/bin:/bin}"

if [[ -x "$HOME/.local/bin/cursor-setup-repo-worker.sh" ]]; then
  exec "$HOME/.local/bin/cursor-setup-repo-worker.sh" "$ROOT"
fi

# Fallback se lo script globale non c’è ancora sul Mac.
repo="$ROOT"
name="$(basename "$repo")"
install_cmd=""
if [[ -f "$repo/package-lock.json" || -f "$repo/npm-shrinkwrap.json" ]]; then
  install_cmd="npm ci"
elif [[ -f "$repo/package.json" ]]; then
  install_cmd="npm install"
fi

mkdir -p "$repo/.cursor"
if [[ -n "$install_cmd" ]]; then
  cat >"$repo/.cursor/environment.json" <<EOF
{
  "name": "$name",
  "install": "$install_cmd",
  "agentCanUpdateSnapshot": true
}
EOF
else
  cat >"$repo/.cursor/environment.json" <<EOF
{
  "name": "$name",
  "agentCanUpdateSnapshot": true
}
EOF
fi

printf 'environment.json → %s/.cursor/environment.json\n' "$repo"
printf 'Worker atteso: ~%s @ Mac mini\n' "${repo#$HOME}"
