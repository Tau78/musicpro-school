"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { getUsageSessionId, logUsage } from "@/lib/usage-log";

/** Prefissi dove ha senso loggare navigazione prodotto (non login/marketing). */
const TRACKED_PREFIXES = [
  "/dashboard",
  "/lezioni",
  "/admin",
  "/prenotazioni",
  "/onboarding",
  "/tabellone",
] as const;

function shouldTrackPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return TRACKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Log navigazione autenticata (dashboard, lezioni, prenotazioni). */
export function UsageLogProvider() {
  const pathname = usePathname();
  const lastRoute = useRef<string | null>(null);
  const sessionLogged = useRef(false);

  useEffect(() => {
    if (!shouldTrackPath(pathname)) return;

    if (!sessionLogged.current) {
      sessionLogged.current = true;
      logUsage("session.start", {
        eventType: "session",
        properties: { sessionId: getUsageSessionId() },
      });
    }

    const search =
      typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
    const route = search ? `${pathname}?${search}` : pathname;
    if (!route || route === lastRoute.current) {
      return;
    }
    lastRoute.current = route;
    logUsage("screen.view", {
      eventType: "screen_view",
      route,
      properties: { pathname },
    });
  }, [pathname]);

  return null;
}
