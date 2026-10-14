"use client";

import { logProductUsageEvent, type ProductUsageEventType } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const SESSION_KEY = "mps_usage_session_id";

function detectClient(): string {
  if (typeof navigator === "undefined") {
    return "web";
  }
  const ua = navigator.userAgent;
  if (/MusicProSchool/i.test(ua)) {
    return "ios_shell";
  }
  return "web";
}

export function getUsageSessionId(): string {
  if (typeof sessionStorage === "undefined") {
    return "ssr";
  }
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `s-${Date.now()}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function logUsage(
  eventName: string,
  options?: {
    eventType?: ProductUsageEventType;
    route?: string;
    properties?: Record<string, unknown>;
  },
): void {
  const supabase = createClient();
  void logProductUsageEvent(supabase, {
    eventName,
    eventType: options?.eventType ?? "action",
    route: options?.route,
    properties: options?.properties,
    sessionId: getUsageSessionId(),
    client: detectClient(),
  });
}
