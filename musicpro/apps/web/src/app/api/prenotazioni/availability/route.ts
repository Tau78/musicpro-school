import { NextResponse } from "next/server";

import { getRoomAvailability } from "@musicpro/database";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
  const excludeBookingId = searchParams.get("excludeBookingId")?.trim() || null;

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

  const durationMinutes = durationParam ? Number(durationParam) : undefined;
  if (
    durationMinutes != null &&
    (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
  ) {
    return NextResponse.json({ message: "Durata non valida." }, { status: 400 });
  }

  try {
    // Solo DB (prenotazioni + calendari esterni già sync): niente Google live.
    const availability = await getRoomAvailability(
      supabase,
      roomId,
      date,
      durationMinutes,
      { excludeBookingId, prefetchNeighbors: false },
    );
    return NextResponse.json(availability);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Impossibile caricare la disponibilità.";
    const status = message.includes("non trovata") ? 404 : 500;
    return NextResponse.json({ message }, { status });
  }
}
