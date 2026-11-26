import { type Database } from "@musicpro/database";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isIscrizioneInternalAuthorized } from "@/lib/iscrizione/internal-auth";
import {
  syncLastMinuteAfterBookingConfirmed,
  syncLastMinuteForDay,
} from "@/lib/last-minute/sync-last-minute-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isIscrizioneInternalAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });
  }

  let body: { booking_id?: string; day_rome?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Body JSON non valido" }, { status: 400 });
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
    const bookingId = body.booking_id?.trim();
    if (bookingId) {
      const result = await syncLastMinuteAfterBookingConfirmed(service, bookingId);
      return NextResponse.json({ success: true, ...result });
    }

    const dayRome = body.day_rome?.trim();
    if (!dayRome || !/^\d{4}-\d{2}-\d{2}$/.test(dayRome)) {
      return NextResponse.json(
        { success: false, message: "Serve booking_id o day_rome (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const result = await syncLastMinuteForDay(service, dayRome, {
      runDigest: true,
      cancelIfNotOperational: false,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[internal/lm-sync-day]", message.slice(0, 400));
    return NextResponse.json({ success: false, message: message.slice(0, 500) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ success: false, message: "Usa POST" }, { status: 405 });
}