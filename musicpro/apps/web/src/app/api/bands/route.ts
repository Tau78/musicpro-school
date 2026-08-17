import { NextRequest, NextResponse } from "next/server";

import { createBand, listMyBands } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CreateBandBody {
  name?: string;
}

export async function GET() {
  try {
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

    const bands = await listMyBands(supabase);
    return NextResponse.json({ success: true, bands });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    let body: CreateBandBody;
    try {
      body = (await request.json()) as CreateBandBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const result = await createBand(supabase, String(body.name || ""));

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.errorMessage },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, id: result.bandId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
