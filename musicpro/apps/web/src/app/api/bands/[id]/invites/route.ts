import { NextRequest, NextResponse } from "next/server";

import { createBandInvite, listBandMembers } from "@musicpro/database";

import { authPublicOrigin, isLocalDevOrigin } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface InviteBody {
  email?: string;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: bandId } = await context.params;
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

    const members = await listBandMembers(supabase, bandId);
    const isMember = members.some((entry) => entry.memberId === member.id);
    if (!isMember) {
      return NextResponse.json(
        { success: false, message: "Band non trovata." },
        { status: 404 },
      );
    }

    let body: InviteBody;
    try {
      body = (await request.json()) as InviteBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const requestOrigin =
      request.headers.get("origin") || request.nextUrl.origin || "";
    const origin =
      requestOrigin && !isLocalDevOrigin(requestOrigin)
        ? requestOrigin.replace(/\/$/, "")
        : authPublicOrigin(process.env);

    const result = await createBandInvite(supabase, {
      bandId,
      invitedByMemberId: member.id,
      email: String(body.email || ""),
    });

    if (!result.success || !result.invite) {
      return NextResponse.json(
        { success: false, message: result.errorMessage },
        { status: 400 },
      );
    }

    const inviteUrl = `${origin.replace(/\/$/, "")}/invite/${result.invite.token}`;

    return NextResponse.json({
      success: true,
      token: result.invite.token,
      inviteUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
