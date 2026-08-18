import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageRooms } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { roomId?: string; calendarId?: string };
  try {
    body = (await request.json()) as { roomId?: string; calendarId?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const roomId = body.roomId?.trim();
  if (!roomId) {
    return NextResponse.json(
      { success: false, message: "roomId obbligatorio" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non autenticato" },
      { status: 401 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageRooms(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
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

  let edgeRes: Response;
  try {
    edgeRes = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/external-calendar-sync`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: roomId,
          external_calendar_id: body.calendarId?.trim() || undefined,
        }),
      },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Funzione sync non raggiungibile." },
      { status: 502 },
    );
  }

  const payload = (await edgeRes.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    events?: number;
  };

  return NextResponse.json(
    {
      success: Boolean(payload.success),
      message:
        payload.message ??
        (edgeRes.ok
          ? "Calendario sincronizzato."
          : `Sincronizzazione non riuscita (${edgeRes.status}).`),
      events: payload.events ?? 0,
    },
    { status: edgeRes.ok ? 200 : edgeRes.status },
  );
}
