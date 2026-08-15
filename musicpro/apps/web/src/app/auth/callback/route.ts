import { NextResponse } from "next/server";

import { ensureMemberLinked } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectTo = requestUrl.searchParams.get("redirect") ?? "/dashboard";
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback_missing_code", requestUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback_failed", requestUrl.origin),
    );
  }

  await ensureMemberLinked(supabase);

  return NextResponse.redirect(new URL(safeRedirect, requestUrl.origin));
}
