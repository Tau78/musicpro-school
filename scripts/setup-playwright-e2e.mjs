#!/usr/bin/env node
/** Setup associato + admin Playwright. Usage: node scripts/setup-playwright-e2e.mjs */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const script of ["setup-playwright-associato.mjs", "setup-playwright-admin.mjs"]) {
  const result = spawnSync("node", [join(root, "scripts", script)], {
    stdio: "inherit",
    cwd: root,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nSetup E2E completo.");
