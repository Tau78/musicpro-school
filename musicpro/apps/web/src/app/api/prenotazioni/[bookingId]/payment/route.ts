import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createRoomBookingPaymentSession } from "@/lib/stripe/room-payment-service";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function getPaymentClient(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || !token) {
      return { supabase: null, user: null };
    }

    const supabase = createSupabaseClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    return { supabase, user };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  try {
    const { bookingId } = await context.params;
    const { supabase, user } = await getPaymentClient(request);

    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, message: "Devi effettuare l'accesso." },
        { status: 401 },
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, message: "Profilo associato non trovato." },
        { status: 403 },
      );
    }

    const origin =
      request.headers.get("origin") ||
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const returnBase = `${origin.replace(/\/$/, "")}/dashboard`;

    const service = createServiceRoleClient();
    const result = await createRoomBookingPaymentSession(
      service,
      bookingId,
      member.id,
      returnBase,
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message ?? "Pagamento non disponibile." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "Impossibile avviare il pagamento." },
      { status: 500 },
    );
  }
}
