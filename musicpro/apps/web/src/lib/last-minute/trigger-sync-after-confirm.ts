import { type Database } from "@musicpro/database";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { syncLastMinuteAfterBookingConfirmed } from "@/lib/last-minute/sync-last-minute-day";

function serviceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Best-effort: campagne LM + digest dopo conferma in fascia serata. */
export function triggerLastMinuteSyncAfterBookingConfirm(bookingId: string): void {
  const id = bookingId.trim();
  if (!id) return;

  const run = async () => {
    const service = serviceClient();
    if (!service) {
      console.warn("[lm-sync-hook] Supabase service role assente");
      return;
    }
    try {
      const result = await syncLastMinuteAfterBookingConfirmed(service, id);
      if ("skipped" in result && result.skipped) {
        console.info("[lm-sync-hook] skip", id.slice(0, 8), result.reason);
        return;
      }
      const stats = result as {
        phase1Created?: number;
        digest?: { days?: unknown[] };
      };
      console.info(
        "[lm-sync-hook] ok",
        id.slice(0, 8),
        `phase1+${stats.phase1Created ?? 0}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[lm-sync-hook]", message.slice(0, 300));
    }
  };

  void run();
}