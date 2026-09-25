import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const monorepoRoot = join(__dirname, "../..");
loadEnvFile(join(monorepoRoot, ".env"));
loadEnvFile(join(monorepoRoot, ".env.local"));

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ||
  "https://school.musicproeventi.it";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
