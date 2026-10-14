import { logProductUsageEvent, type ProductUsageEventType } from "@musicpro/database";

import { createClient } from "@/lib/supabase";

function getUsageSessionId(): string {
  // SecureStore async — session id leggero in memoria per la sessione app
  let id = (globalThis as { __mpsUsageSid?: string }).__mpsUsageSid;
  if (!id) {
    id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    (globalThis as { __mpsUsageSid?: string }).__mpsUsageSid = id;
  }
  return id;
}

export function logMobileUsage(
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
    client: "mobile",
  });
}
