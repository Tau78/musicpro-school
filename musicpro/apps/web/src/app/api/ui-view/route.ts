import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import {
  UI_VIEW_COOKIE,
  switchableUiViews,
  type UiView,
} from "@/lib/admin/ui-view";
import { createClient } from "@/lib/supabase/server";

function isUiView(value: unknown): value is UiView {
  return value === "admin" || value === "docente" || value === "associato";
}

export async function POST(request: Request) {
  let view: unknown;
  try {
    const body = (await request.json()) as { view?: unknown };
    view = body.view;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isUiView(view)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const allowed = switchableUiViews(member.roles);
  if (allowed.length < 2 || !allowed.includes(view)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(UI_VIEW_COOKIE, view, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 400,
  });
  return response;
}
