import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPublicDisplaySettings } from "@musicpro/database";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { BOARD_PIN_COOKIE, boardPinsMatch, safeBoardPath } from "@/lib/tabellone/pin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    pin?: unknown;
    next?: unknown;
  } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const next = safeBoardPath(typeof body?.next === "string" ? body.next : "/tabellone");

  let settings: Awaited<ReturnType<typeof getPublicDisplaySettings>>;
  try {
    settings = await getPublicDisplaySettings(createServiceRoleClient());
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (!settings?.enabled || !boardPinsMatch(pin, settings.pin)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(BOARD_PIN_COOKIE, settings.pin, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });

  return NextResponse.json({ ok: true, next });
}
