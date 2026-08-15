#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$WEB/../.." && pwd)"

cd "$ROOT"
npm install

mkdir -p "$WEB/node_modules"
ln -sfn "$ROOT/node_modules/next" "$WEB/node_modules/next"
ln -sfn "$ROOT/node_modules/react" "$WEB/node_modules/react"
ln -sfn "$ROOT/node_modules/react-dom" "$WEB/node_modules/react-dom"
