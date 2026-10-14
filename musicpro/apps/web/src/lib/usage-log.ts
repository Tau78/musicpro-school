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
  if (typeof window === "undefined") {
    return "ssr";
  }
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `s-${Date.now()}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // WKWebView / privacy mode: sessionStorage può lanciare SecurityError
    return `mem-${Date.now()}`;
  }
}

export function logUsage(
  eventName: string,
  options?: {
    eventType?: ProductUsageEventType;
    route?: string;
    properties?: Record<string, unknown>;
  },
): void {
  try {
    const supabase = createClient();
    void logProductUsageEvent(supabase, {
      eventName,
      eventType: options?.eventType ?? "action",
      route: options?.route,
      properties: options?.properties,
      sessionId: getUsageSessionId(),
      client: detectClient(),
    }).catch(() => undefined);
  } catch {
    /* telemetry must never break UI */
  }
}
