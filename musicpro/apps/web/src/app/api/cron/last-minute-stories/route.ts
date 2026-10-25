import type { Database } from "@musicpro/database";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { publishSchoolLastMinuteDigestStories } from "@/lib/queue-school-lm-story-to-eventi";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { success: false, message: "Config Supabase mancante" },
      { status: 500 },
    );
  }

  const service = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const digest = await publishSchoolLastMinuteDigestStories(service);
    return NextResponse.json({
      success: true,
      digest,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cron digest last minute fallito";
    return NextResponse.json(
      { success: false, message: message.slice(0, 500) },
      { status: 500 },
    );
  }
}
