#!/usr/bin/env node
/**
 * Blocca il pattern che ha fatto crashare /admin/lezioni/corsi:
 * Server Component (app/** senza "use client") che passa una arrow/function
 * prop a un Client Component ("use client").
 *
 * Uso: node scripts/check-rsc-client-function-props.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

function isClientModule(source) {
  return /^\s*["']use client["']\s*;/m.test(source);
}

function exportedNames(source) {
  const names = new Set();
  const re =
    /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)|export\s+(?:const|let)\s+([A-Z][A-Za-z0-9]*)\s*=/g;
  let m;
  while ((m = re.exec(source))) {
    names.add(m[1] || m[2]);
  }
  const def = source.match(
    /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/,
  );
  if (def) names.add(def[1]);
  return names;
}

const files = walk(SRC);
/** @type {Map<string, string>} exportName -> relative path */
const clientExports = new Map();

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!isClientModule(source)) continue;
  const rel = relative(SRC, file);
  for (const name of exportedNames(source)) {
    clientExports.set(name, rel);
  }
}

const FUNCTION_PROP =
  /\b([A-Za-z_][A-Za-z0-9_]*)=\{\s*(?:\([^)]*\)\s*=>|async\s*\([^)]*\)\s*=>|function\b)/g;

/** Handler tipici: se compaiono in una page server verso un Client Component, sono comunque non serializzabili — li segnaliamo. */
const issues = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (isClientModule(source)) continue;
  const rel = relative(SRC, file).replace(/\\/g, "/");
  if (!rel.startsWith("app/")) continue;

  /** @type {Map<string, string>} localName -> exportName */
  const importedClients = new Map();
  const importRe = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let im;
  while ((im = importRe.exec(source))) {
    const specs = im[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const spec of specs) {
      const parts = spec.split(/\s+as\s+/).map((p) => p.trim());
      const exported = parts[0];
      const local = parts[1] || parts[0];
      if (clientExports.has(exported)) {
        importedClients.set(local, exported);
      }
    }
  }

  if (importedClients.size === 0) continue;

  for (const [local, exported] of importedClients) {
    const tagRe = new RegExp(`<${local}\\b([\\s\\S]*?)(?:\\/>|>)`, "g");
    let tag;
    while ((tag = tagRe.exec(source))) {
      const attrs = tag[1] || "";
      FUNCTION_PROP.lastIndex = 0;
      let pm;
      while ((pm = FUNCTION_PROP.exec(attrs))) {
        const prop = pm[1];
        const line = source.slice(0, tag.index).split(/\n/).length;
        issues.push({
          file: rel,
          line,
          component: local,
          prop,
          clientFile: clientExports.get(exported) || "?",
        });
      }
    }
  }
}

if (issues.length === 0) {
  console.log("OK: nessun Server→Client function prop sospetto in app/");
  process.exit(0);
}

console.error(
  "ERRORE: funzioni passate da Server Component a Client Component:\n",
);
for (const issue of issues) {
  console.error(
    `  ${issue.file}:${issue.line}  <${issue.component} ${issue.prop}={…} />  (client: ${issue.clientFile})`,
  );
}
console.error(
  "\nUsa props serializzabili (es. hrefBase stringa) o tieni il componente come Server Component.",
);
console.error("Vedi .cursor/rules/rsc-no-function-props-to-client.mdc");
process.exit(1);
