import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sendDueLessonReminders, type Database } from "@musicpro/database";

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

  const service = createClient<Database>(supabaseUrl, serviceKey);

  try {
    const result = await sendDueLessonReminders(service);
    return NextResponse.json({
      success: result.errors.length === 0,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        sent: 0,
        skipped: 0,
        message: err instanceof Error ? err.message : "Reminder falliti.",
      },
      { status: 500 },
    );
  }
}
