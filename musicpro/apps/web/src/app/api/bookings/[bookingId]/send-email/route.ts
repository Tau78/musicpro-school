import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles, type Database } from "@musicpro/database";

import { processBookingEmail } from "@/lib/booking/process-booking-email";
import { createClient } from "@/lib/supabase/server";

async function getRequestClient(request: Request): Promise<{
  supabase: SupabaseClient<Database> | null;
  userId: string | null;
  viaBearer: boolean;
}> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || !token) {
      return { supabase: null, userId: null, viaBearer: true };
    }

    const supabase = createSupabaseClient<Database>(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    return { supabase, userId: user?.id ?? null, viaBearer: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, userId: user?.id ?? null, viaBearer: false };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { bookingId } = await context.params;

  if (!bookingId) {
    return NextResponse.json({ success: false, message: "ID mancante" }, { status: 400 });
  }

  let template: "confirm" | "modified" = "confirm";
  let force = false;
  let paymentUrl: string | undefined;

  try {
    const body = (await request.json()) as {
      template?: string;
      force?: boolean;
      payment_url?: string;
    };
    if (body.template === "modified") template = "modified";
    if (body.force === true) force = true;
    if (body.payment_url?.trim()) paymentUrl = body.payment_url.trim();
  } catch {
    // defaults
  }

  const { supabase, userId, viaBearer } = await getRequestClient(request);

  if (!supabase || !userId) {
    return NextResponse.json({ success: false, message: "Non autenticato" }, { status: 401 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, member_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return NextResponse.json(
      { success: false, message: "Prenotazione non trovata" },
      { status: 404 },
    );
  }

  let memberId: string | null = null;
  let isStaff = false;

  if (viaBearer) {
    const { data: memberRow } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    memberId = memberRow?.id ?? null;
    if (memberId) {
      const { data: roleRows } = await supabase
        .from("member_roles")
        .select("role")
        .eq("member_id", memberId)
        .is("revoked_at", null);
      isStaff = (roleRows ?? []).some(
        (row) => row.role === "admin" || row.role === "segreteria",
      );
    }
  } else {
    const currentMember = await getCurrentMemberWithRoles(supabase);
    memberId = currentMember?.id ?? null;
    isStaff = Boolean(
      currentMember?.roles.some((r) => r === "admin" || r === "segreteria"),
    );
  }

  const isOwner = memberId === booking.member_id;
  if (!isOwner && !isStaff) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 403 });
  }

  try {
    const result = await processBookingEmail({
      bookingId,
      template,
      force,
      paymentUrl,
    });
    const status = result.success === false ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bookings/send-email]", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
