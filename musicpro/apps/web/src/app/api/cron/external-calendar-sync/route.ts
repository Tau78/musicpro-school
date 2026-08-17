import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

  const service = createClient(supabaseUrl, serviceKey);

  const { data: calendars, error: calendarsError } = await service
    .from("room_external_calendars")
    .select("room_id")
    .eq("enabled", true);

  if (calendarsError) {
    return NextResponse.json(
      { success: false, message: calendarsError.message },
      { status: 500 },
    );
  }

  const roomIds = [
    ...new Set((calendars ?? []).map((row) => row.room_id as string)),
  ];

  if (roomIds.length === 0) {
    return NextResponse.json({
      success: true,
      synced: 0,
      message: "Nessun calendario esterno attivo da sincronizzare.",
    });
  }

  const edgeBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/external-calendar-sync`;
  const results: Array<{ roomId: string; ok: boolean; payload: unknown }> = [];

  for (const roomId of roomIds) {
    const edgeRes = await fetch(edgeBase, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ room_id: roomId }),
    });

    const payload = (await edgeRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    results.push({ roomId, ok: edgeRes.ok, payload });
  }

  const synced = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json(
    {
      success: failed.length === 0,
      synced,
      total: roomIds.length,
      results,
      message:
        failed.length === 0
          ? `Sincronizzati ${synced} sale con calendari esterni.`
          : `${failed.length} sincronizzazioni fallite su ${roomIds.length} sale.`,
    },
    { status: failed.length > 0 && synced === 0 ? 502 : 200 },
  );
}
