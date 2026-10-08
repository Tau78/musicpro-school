import { type NextRequest, NextResponse } from "next/server";

import {
  isLessonsModuleEnabled,
  isLessonsPath,
  lessonsModuleApiDisabledBody,
} from "@/lib/lessons-module";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isLessonsPath(pathname) && !isLessonsModuleEnabled()) {
    if (pathname.startsWith("/api/lezioni")) {
      return NextResponse.json(lessonsModuleApiDisabledBody(), { status: 503 });
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "?info=lessons_sandbox";
    return NextResponse.redirect(redirectUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|paga-nexi.html|api/website|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)",
  ],
};
