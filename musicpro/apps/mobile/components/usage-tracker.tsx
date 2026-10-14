import { useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { logMobileUsage } from "@/lib/usage-log";

import { useAuth } from "@/contexts/AuthContext";

export function UsageTracker() {
  const { session } = useAuth();
  const segments = useSegments();
  const lastRoute = useRef<string | null>(null);
  const sessionLogged = useRef(false);

  useEffect(() => {
    if (!session) {
      sessionLogged.current = false;
      return;
    }
    if (!sessionLogged.current) {
      sessionLogged.current = true;
      logMobileUsage("session.start", { eventType: "session" });
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const route = segments.join("/") || "root";
    if (route === lastRoute.current) {
      return;
    }
    lastRoute.current = route;
    logMobileUsage("screen.view", {
      eventType: "screen_view",
      route: `/${route}`,
      properties: { segments },
    });
  }, [segments, session]);

  return null;
}
