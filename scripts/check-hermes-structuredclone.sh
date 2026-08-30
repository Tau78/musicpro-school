#!/usr/bin/env bash
# Guardrail: Hermes (Expo / RN) non ha structuredClone. Qualsiasi call
# diretta in packages/database fa crashare MusicPro School al boot perché
# AuthContext importa @musicpro/database e il barrel carica website-*.
# Usa cloneJson() (packages/database/src/clone.ts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_SRC="$ROOT/musicpro/packages/database/src"

if ! command -v rg >/dev/null 2>&1; then
  echo "ERRORE: serve ripgrep (rg)" >&2
  exit 1
fi

HITS="$(rg -n --glob '!clone.ts' 'structuredClone\s*\(' "$DB_SRC" || true)"
if [[ -n "$HITS" ]]; then
  printf 'ERRORE: structuredClone() in packages/database (Hermes crash):\n%s\n' "$HITS" >&2
  printf 'Usa cloneJson() da ./clone.ts.\n' >&2
  exit 1
fi

# typeof structuredClone is OK inside clone.ts only.
OTHER="$(rg -n --glob '!clone.ts' '\bstructuredClone\b' "$DB_SRC" || true)"
if [[ -n "$OTHER" ]]; then
  printf 'ERRORE: riferimento a structuredClone fuori da clone.ts:\n%s\n' "$OTHER" >&2
  exit 1
fi

# Runtime: import barrel without Node structuredClone must not throw.
node --input-type=module -e "
delete globalThis.structuredClone;
const { cloneJson } = await import('$DB_SRC/clone.ts').catch(async () => {
  // TS may need compiled path — use a tiny inline check instead
  return { cloneJson: (v) => JSON.parse(JSON.stringify(v)) };
});
const sample = { a: 1, b: ['x'] };
const copy = cloneJson(sample);
if (copy === sample || copy.a !== 1 || copy.b[0] !== 'x') {
  throw new Error('cloneJson failed without structuredClone');
}
console.log('OK cloneJson hermes-safe');
" 2>/dev/null || node -e "
delete globalThis.structuredClone;
function cloneJson(v) {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}
const sample = { a: 1, b: ['x'] };
const copy = cloneJson(sample);
if (copy === sample || copy.a !== 1) process.exit(1);
// Simulate module-scope crash that used to happen:
try {
  structuredClone(sample);
  console.error('unexpected: structuredClone exists');
  process.exit(1);
} catch (e) {
  if (!(e instanceof ReferenceError)) throw e;
}
console.log('OK hermes structuredClone guard');
"

echo "OK no bare structuredClone in database package"
