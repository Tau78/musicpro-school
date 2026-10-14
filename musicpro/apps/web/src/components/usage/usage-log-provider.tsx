"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { getUsageSessionId, logUsage } from "@/lib/usage-log";

function UsageLogRoutesInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastRoute = useRef<string | null>(null);
  const sessionLogged = useRef(false);

  useEffect(() => {
    if (!sessionLogged.current) {
      sessionLogged.current = true;
      logUsage("session.start", {
        eventType: "session",
        properties: { sessionId: getUsageSessionId() },
      });
    }
  }, []);

  useEffect(() => {
    const qs = searchParams?.toString();
    const route = qs ? `${pathname}?${qs}` : pathname;
    if (!route || route === lastRoute.current) {
      return;
    }
    lastRoute.current = route;
    logUsage("screen.view", {
      eventType: "screen_view",
      route,
      properties: { pathname },
    });
  }, [pathname, searchParams]);

  return null;
}

/** Log navigazione autenticata (dashboard, lezioni, prenotazioni). */
export function UsageLogProvider() {
  return (
    <Suspense fallback={null}>
      <UsageLogRoutesInner />
    </Suspense>
  );
}
