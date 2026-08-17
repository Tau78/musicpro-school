import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  buildRoomAvailability,
  getBookingSettings,
  getRomeDayBoundsUtc,
  getRoomById,
  type BusyInterval,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

async function getAvailabilityClient(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || !token) {
      return { supabase: null, user: null };
    }

    const supabase = createSupabaseClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    return { supabase, user };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.trim();
  const date = searchParams.get("date")?.trim();
  const durationParam = searchParams.get("duration");

  if (!roomId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { message: "Parametri roomId e date (YYYY-MM-DD) obbligatori." },
      { status: 400 },
    );
  }

  const { supabase, user } = await getAvailabilityClient(request);

  if (!supabase || !user) {
    return NextResponse.json({ message: "Non autenticato." }, { status: 401 });
  }

  const room = await getRoomById(supabase, roomId);
  if (!room) {
    return NextResponse.json({ message: "Sala non trovata." }, { status: 404 });
  }

  const durationMinutes = durationParam
    ? Number(durationParam)
    : room.default_duration_minutes;

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ message: "Durata non valida." }, { status: 400 });
  }

  const settings = await getBookingSettings(supabase);

  const { startUtc, endUtc } = getRomeDayBoundsUtc(date);

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, start_at, end_at, status")
    .eq("room_id", roomId)
    .lt("start_at", endUtc)
    .gt("end_at", startUtc)
    .neq("status", "cancelled");

  if (bookingsError) {
    return NextResponse.json(
      { message: `Impossibile caricare le prenotazioni: ${bookingsError.message}` },
      { status: 500 },
    );
  }

  let calendarBusy: BusyInterval[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      const edgeRes = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/functions/v1/calendar-availability`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ room_id: roomId, date }),
          next: { revalidate: 0 },
        },
      );

      const edgePayload = (await edgeRes.json().catch(() => ({}))) as {
        success?: boolean;
        busy?: BusyInterval[];
        message?: string;
      };

      if (edgeRes.ok && edgePayload.success && Array.isArray(edgePayload.busy)) {
        calendarBusy = edgePayload.busy;
      } else if (!edgeRes.ok) {
        console.error(
          "[availability] calendar-availability",
          edgePayload.message ?? edgeRes.status,
        );
      }
    } catch (err) {
      console.error(
        "[availability] calendar-availability",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const availability = buildRoomAvailability(
    room,
    date,
    durationMinutes,
    (bookings ?? []) as Array<{
      id: string;
      start_at: string;
      end_at: string;
      status: import("@musicpro/database").BookingStatus;
    }>,
    settings,
    calendarBusy,
  );

  return NextResponse.json(availability);
}
