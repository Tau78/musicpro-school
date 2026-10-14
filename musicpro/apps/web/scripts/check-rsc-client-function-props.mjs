#!/usr/bin/env node
/**
 * Blocca Server Component (app/** senza "use client") che passa una funzione
 * a un Client Component — crash Next: digest tipo 1015345330.
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

function exportedComponentNames(source) {
  const names = new Set();
  const re =
    /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)|export\s+(?:const|let)\s+([A-Z][A-Za-z0-9]*)\s*=/g;
  let m;
  while ((m = re.exec(source))) names.add(m[1] || m[2]);
  const def = source.match(/export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/);
  if (def) names.add(def[1]);
  return names;
}

/** Estrae attributi del primo tag JSX `<Name …>` / `<Name …/>` gestendo `{}` annidate. */
function extractJsxOpenAttrs(source, componentName) {
  const results = [];
  const startRe = new RegExp(`<${componentName}\\b`, "g");
  let sm;
  while ((sm = startRe.exec(source))) {
    let i = sm.index + sm[0].length;
    let depthBrace = 0;
    let inStr = null;
    let attrs = "";
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];
      if (inStr) {
        attrs += ch;
        if (ch === "\\" && inStr !== "`") {
          attrs += next ?? "";
          i += 2;
          continue;
        }
        if (ch === inStr) inStr = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inStr = ch;
        attrs += ch;
        i += 1;
        continue;
      }
      if (ch === "{") {
        depthBrace += 1;
        attrs += ch;
        i += 1;
        continue;
      }
      if (ch === "}") {
        depthBrace = Math.max(0, depthBrace - 1);
        attrs += ch;
        i += 1;
        continue;
      }
      if (depthBrace === 0 && ch === "/" && next === ">") {
        results.push({ attrs, index: sm.index });
        break;
      }
      if (depthBrace === 0 && ch === ">") {
        results.push({ attrs, index: sm.index });
        break;
      }
      attrs += ch;
      i += 1;
    }
  }
  return results;
}

function findFunctionProps(attrs) {
  const found = [];
  // prop={ ( ... ) =>  OR prop={ async ( ... ) => OR prop={ function
  const re =
    /\b([A-Za-z_][\w]*)\s*=\s*\{\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>|\b([A-Za-z_][\w]*)\s*=\s*\{\s*function\b/g;
  let m;
  while ((m = re.exec(attrs))) {
    found.push(m[1] || m[2]);
  }
  // Nomi tipici anche se il body è multilinea strano
  for (const name of ["hrefFor", "getHref", "getUrl", "renderItem", "renderTitle"]) {
    if (new RegExp(`\\b${name}\\s*=\\s*\\{`).test(attrs) && /=>/.test(attrs)) {
      if (!found.includes(name)) found.push(name);
    }
  }
  return found;
}

const files = walk(SRC);
/** @type {Map<string, string>} */
const clientExports = new Map();

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!isClientModule(source)) continue;
  const rel = relative(SRC, file).replace(/\\/g, "/");
  for (const name of exportedComponentNames(source)) {
    clientExports.set(name, rel);
  }
}

const issues = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (isClientModule(source)) continue;
  const rel = relative(SRC, file).replace(/\\/g, "/");
  if (!rel.startsWith("app/")) continue;

  /** @type {Map<string, string>} local -> export */
  const importedClients = new Map();
  const importRe = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let im;
  while ((im = importRe.exec(source))) {
    for (const spec of im[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      const parts = spec.split(/\s+as\s+/).map((p) => p.trim());
      const exported = parts[0];
      const local = parts[1] || parts[0];
      if (clientExports.has(exported)) importedClients.set(local, exported);
    }
  }
  if (importedClients.size === 0) continue;

  for (const [local, exported] of importedClients) {
    for (const { attrs, index } of extractJsxOpenAttrs(source, local)) {
      for (const prop of findFunctionProps(attrs)) {
        const line = source.slice(0, index).split(/\n/).length;
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
