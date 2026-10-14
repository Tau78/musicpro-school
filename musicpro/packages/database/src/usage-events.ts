import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./types/database";

export type ProductUsageEventType =
  | "screen_view"
  | "action"
  | "error"
  | "session";

export type LogProductUsageEventInput = {
  eventName: string;
  eventType?: ProductUsageEventType;
  route?: string | null;
  properties?: Record<string, unknown>;
  sessionId?: string | null;
  client?: string;
};

/** Fire-and-forget: non blocca la UI se il log fallisce. */
export async function logProductUsageEvent(
  supabase: SupabaseClient<Database>,
  input: LogProductUsageEventInput,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("log_product_usage_event", {
    p_event_name: input.eventName,
    p_event_type: input.eventType ?? "action",
    p_route: input.route ?? undefined,
    p_properties: (input.properties ?? {}) as Json,
    p_session_id: input.sessionId ?? undefined,
    p_client: input.client ?? "web",
  });

  if (error) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[usage]", error.message);
    }
    return null;
  }

  return typeof data === "string" ? data : null;
}

export type PilotUsageEventRow = {
  event_id: string;
  created_at: string;
  member_id: string;
  email: string | null;
  display_name: string | null;
  role_in_cohort: string;
  event_type: string;
  event_name: string;
  route: string | null;
  properties: Record<string, unknown> | null;
  session_id: string | null;
  client: string;
};

export async function listPilotUsageEvents(
  supabase: SupabaseClient<Database>,
  options?: { since?: string; limit?: number },
): Promise<PilotUsageEventRow[]> {
  const { data, error } = await supabase.rpc("list_pilot_usage_events", {
    p_since: options?.since,
    p_limit: options?.limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PilotUsageEventRow[];
}
