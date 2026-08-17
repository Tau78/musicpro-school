import { NextRequest, NextResponse } from "next/server";

import { acceptBandInvite, getBandInviteByToken } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const supabase = await createClient();
    const invite = await getBandInviteByToken(supabase, token);

    if (!invite) {
      return NextResponse.json(
        { success: false, message: "Invito non valido." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, invite });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Devi effettuare l'accesso." },
        { status: 401 },
      );
    }

    const result = await acceptBandInvite(supabase, token);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.errorMessage },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, bandId: result.bandId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
