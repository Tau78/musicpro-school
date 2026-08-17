import { NextRequest, NextResponse } from "next/server";

import { getBand, leaveBand, listBandMembers } from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    const [band, members] = await Promise.all([
      getBand(supabase, id),
      listBandMembers(supabase, id),
    ]);

    if (!band) {
      return NextResponse.json(
        { success: false, message: "Band non trovata." },
        { status: 404 },
      );
    }

    const isMember = members.some((entry) => entry.memberId === member.id);
    if (!isMember) {
      return NextResponse.json(
        { success: false, message: "Band non trovata." },
        { status: 404 },
      );
    }

    const myMembership = members.find((entry) => entry.memberId === member.id);

    return NextResponse.json({
      success: true,
      band: {
        ...band,
        members,
        myRole: myMembership?.role ?? null,
        myStatus: myMembership?.status ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    const result = await leaveBand(supabase, id, member.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.errorMessage },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
