import { NextRequest, NextResponse } from "next/server";

import { saveMyBandName } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SaveBandNameBody {
  name?: string;
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

    let body: SaveBandNameBody;
    try {
      body = (await request.json()) as SaveBandNameBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const result = await saveMyBandName(supabase, String(body.name || ""));

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.errorMessage },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      id: result.bandId,
      name: result.name,
      bookingsSynced: result.bookingsSynced ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
