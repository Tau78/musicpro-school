import type { Database } from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type SchoolClient = SupabaseClient<Database>;

/** True se esiste almeno una prenotazione confirmed in fascia serata operativa del giorno Roma. */
export async function isEveningOperationalForDay(
  service: SchoolClient,
  dayRome: string,
): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayRome)) return false;

  const { data, error } = await service.rpc("booking_evening_operational_active", {
    p_day: dayRome,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}