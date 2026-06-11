import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const monorepoRoot = path.join(__dirname, "../..");
loadEnvConfig(monorepoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@musicpro/database", "@musicpro/shared"],
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
