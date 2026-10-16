/**
 * Reinvia solo alla famiglia l'email di avvio corso (niente docente).
 *   npx tsx scripts/resend-course-family-email.ts <courseId> [...]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { notifyCourseCreatedActive } from "../musicpro/packages/database/src/lessons-notify";

function loadEnv() {
  const root = join(import.meta.dirname, "..");
  for (const rel of ["musicpro/.env", "musicpro/.env.local"]) {
    try {
      for (const line of readFileSync(join(root, rel), "utf8").split("\n")) {
        const i = line.indexOf("=");
        if (i < 1 || line.startsWith("#")) continue;
        const key = line.slice(0, i).trim();
        if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
      }
    } catch {
      /* file assente */
    }
  }
}

loadEnv();

const courseIds = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (courseIds.length === 0) {
  console.error("Passa almeno un course id.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano SUPABASE URL o SERVICE_ROLE_KEY.");
  process.exit(1);
}

const client = createClient(url, key);

async function main() {
  for (const courseId of courseIds) {
    await notifyCourseCreatedActive(client, { courseId, familyOnly: true });
    console.log(JSON.stringify({ courseId, family: true }));
  }
}

void main();
