#!/usr/bin/env node
/**
 * Blocca Client Components ("use client") che importano (anche in transitivo)
 * moduli server-only: next/headers, @/lib/supabase/server, o file che li usano.
 *
 * Sintomo Vercel: "You're importing a component that needs next/headers".
 * Uso: node scripts/check-client-server-boundary.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

const SERVER_MARKERS = [
  "next/headers",
  "@/lib/supabase/server",
  "lib/supabase/server",
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

function isClientModule(source) {
  return /^\s*["']use client["']\s*;/m.test(source);
}

/** Value imports only — `import type` is erased and does not pull server code. */
function parseValueImports(source) {
  const imports = [];
  const re =
    /(?:^|\n)\s*import\s+(?!type\b)(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source))) imports.push(m[1]);
  const side = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  while ((m = side.exec(source))) imports.push(m[1]);
  return imports;
}

function resolveImport(fromFile, spec) {
  if (spec.startsWith("@/")) {
    return resolveUnderSrc(join(SRC, spec.slice(2)));
  }
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return resolveUnderSrc(resolve(dirname(fromFile), spec));
  }
  // bare / package — only care about known server markers as strings
  return null;
}

function resolveUnderSrc(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function isServerMarkerSpec(spec) {
  return SERVER_MARKERS.some(
    (m) => spec === m || spec.endsWith(`/${m}`) || spec.includes(m),
  );
}

const files = walk(SRC);
const sourceByFile = new Map();
for (const f of files) {
  sourceByFile.set(f, readFileSync(f, "utf8"));
}

const clientFiles = files.filter((f) => isClientModule(sourceByFile.get(f)));
const errors = [];

for (const client of clientFiles) {
  const queue = [client];
  const seen = new Set();
  const pathFrom = new Map([[client, null]]);

  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const src = sourceByFile.get(cur);
    if (!src) continue;

    for (const spec of parseValueImports(src)) {
      if (isServerMarkerSpec(spec)) {
        const chain = [];
        let n = cur;
        while (n) {
          chain.push(relative(ROOT, n));
          n = pathFrom.get(n);
        }
        chain.reverse();
        errors.push({
          client: relative(ROOT, client),
          via: [...chain, spec].join(" → "),
        });
        queue.length = 0;
        break;
      }
      const resolved = resolveImport(cur, spec);
      if (!resolved || seen.has(resolved) || !sourceByFile.has(resolved)) {
        continue;
      }
      // Stop expanding if the target is itself a client boundary? No — still
      // follow: a client can import a shared module that imports server.
      pathFrom.set(resolved, cur);
      queue.push(resolved);
    }
  }
}

if (errors.length) {
  console.error(
    "FAIL: Client Component importa moduli server-only (next/headers / supabase/server).\n" +
      "Spezza path/tipi/pure helpers in un file senza createClient, come documenti-paths.\n",
  );
  for (const e of errors) {
    console.error(`- ${e.client}\n  ${e.via}\n`);
  }
  process.exit(1);
}

console.log(
  `OK: nessun Client→server boundary sospetto (${clientFiles.length} client modules controllati)`,
);
