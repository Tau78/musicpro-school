#!/usr/bin/env node
/**
 * Postbuild Vercel monorepo (pattern musicpro-eventi-app):
 * noop.js risolve path0/apps/web dove path0 = root repo Git (MusicPro School/),
 * non musicpro/apps/web. Copia .next + next nel path atteso dal packager.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const webDir = path.join(monorepoRoot, "apps/web");
const packagerWebDir = path.join(monorepoRoot, "..", "apps", "web");
const srcNext = path.join(monorepoRoot, "node_modules/next");

function assertExists(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`FAIL: manca ${label}: ${p}`);
    process.exit(1);
  }
}

assertExists(path.join(webDir, ".next"), "musicpro/apps/web/.next");
assertExists(
  path.join(srcNext, "dist/compiled/next-server/server.runtime.prod.js"),
  "server.runtime.prod.js",
);

fs.mkdirSync(path.dirname(packagerWebDir), { recursive: true });
fs.rmSync(packagerWebDir, { recursive: true, force: true });
fs.mkdirSync(packagerWebDir, { recursive: true });

for (const name of ["package.json", "next.config.ts", "next-env.d.ts"]) {
  const src = path.join(webDir, name);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(packagerWebDir, name));
  }
}

fs.cpSync(path.join(webDir, ".next"), path.join(packagerWebDir, ".next"), {
  recursive: true,
});

const destNext = path.join(packagerWebDir, "node_modules/next");
fs.mkdirSync(path.dirname(destNext), { recursive: true });
fs.cpSync(srcNext, destNext, { recursive: true });

assertExists(
  path.join(packagerWebDir, ".next", "routes-manifest.json"),
  "routes-manifest.json",
);
assertExists(
  path.join(destNext, "dist/compiled/next-server/server.runtime.prod.js"),
  "packager apps/web/node_modules/next",
);

console.log("OK: packager mirror <repo-root>/apps/web (.next + next per noop.js)");
