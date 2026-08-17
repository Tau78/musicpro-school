import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/prenotazioni",
];
const AUTH_PATHS = ["/login", "/signup"];
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];
const ONBOARDING_PATHS = ["/onboarding", "/invite"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }

  return ONBOARDING_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function shouldSkipOnboardingCheck(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Docente) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!user && isOnboardingPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && AUTH_PATHS.includes(pathname)) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const destination =
      redirectParam && redirectParam.startsWith("/") ? redirectParam : "/dashboard";
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = destination;
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  if (
    user &&
    pathname.startsWith("/dashboard")
  ) {
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (member?.id) {
      const { data: roleRows } = await supabase
        .from("member_roles")
        .select("role")
        .eq("member_id", member.id)
        .is("revoked_at", null);

      const roles = (roleRows ?? []).map(
        (row) => row.role as MemberRoleValue,
      );

      const isAssociato = roles.includes(MemberRole.Associato);
      const skipCheck = shouldSkipOnboardingCheck(roles);

      if (isAssociato && !skipCheck) {
        const fiscalYear = new Date().getFullYear();
        const { data: quotaOk } = await supabase.rpc("member_quota_ok", {
          p_member_id: member.id,
          p_fiscal_year: fiscalYear,
        });

        if (!quotaOk) {
          const onboardingUrl = request.nextUrl.clone();
          onboardingUrl.pathname = "/onboarding";
          onboardingUrl.search = "";
          return NextResponse.redirect(onboardingUrl);
        }
      }
    }
  }

  if (!user && pathname === "/" && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
