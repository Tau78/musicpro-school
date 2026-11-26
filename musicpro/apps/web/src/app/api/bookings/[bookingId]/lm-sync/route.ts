import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles, type Database } from "@musicpro/database";
import { syncLastMinuteAfterBookingConfirmed } from "@/lib/last-minute/sync-last-minute-day";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ bookingId: string }> };

function staffOrOwner(
  bookingMemberId: string,
  current: Awaited<ReturnType<typeof getCurrentMemberWithRoles>>,
): boolean {
  if (!current?.id) return false;
  if (current.id === bookingMemberId) return true;
  return (
    current.roles.includes("admin") ||
    current.roles.includes("segreteria") ||
    current.roles.includes("collaboratore")
  );
}

export async function POST(_request: Request, context: RouteContext) {
  const { bookingId } = await context.params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ success: false, message: "ID mancante" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member?.id) {
    return NextResponse.json({ success: false, message: "Non autenticato" }, { status: 401 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, member_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking?.id) {
    return NextResponse.json(
      { success: false, message: "Prenotazione non trovata" },
      { status: 404 },
    );
  }

  if (!staffOrOwner(booking.member_id as string, member)) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { success: false, message: "Config server mancante" },
      { status: 500 },
    );
  }

  const service = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await syncLastMinuteAfterBookingConfirmed(service, bookingId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message: message.slice(0, 500) }, { status: 500 });
  }
}