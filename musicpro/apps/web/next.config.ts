import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const monorepoRoot = path.join(__dirname, "../..");
const workspaceRoot = path.join(monorepoRoot, "..");
loadEnvConfig(monorepoRoot);
loadEnvConfig(__dirname);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const nextConfig: NextConfig = {
  env: {
    ...(supabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl } : {}),
    ...(supabaseAnonKey ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey } : {}),
  },
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
      "musicpro/apps/web/src/lib/reimbursements/assets/**/*",
    ],
  },
  serverExternalPackages: ["stripe", "nodemailer"],
  // Evita HTML “stale” che punta a CSS/_next già purgati dopo un deploy.
  async headers() {
    // Ordine conta: la prima regola che matcha vince.
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
