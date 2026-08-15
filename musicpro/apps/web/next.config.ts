import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const monorepoRoot = path.join(__dirname, "../..");
const workspaceRoot = path.join(monorepoRoot, "..");
loadEnvConfig(monorepoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@musicpro/database", "@musicpro/shared"],
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/*": [
      "musicpro/node_modules/next/dist/compiled/**/*",
      "musicpro/node_modules/next/dist/server/**/*",
    ],
    "/api/**/*": [
      "musicpro/node_modules/next/dist/compiled/**/*",
      "musicpro/node_modules/next/dist/server/**/*",
    ],
  },
  serverExternalPackages: ["stripe"],
};

export default nextConfig;
