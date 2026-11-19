import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import { ensureMemberAuthAccess } from "@/lib/admin/staff-auth";
import { sendMagicLinkEmail } from "@/lib/auth/send-magic-link";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const SUCCESS_MESSAGE =
  "Link di accesso inviato via email. Controlla anche lo spam.";

interface Body {
  memberId?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Richiesta non valida. Riprova." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageMembers(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato." },
      { status: 403 },
    );
  }

  const memberId = body.memberId?.trim();
  if (!memberId) {
    return NextResponse.json(
      { success: false, message: "Manca l'associato." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { data: member, error: memberError } = await service
    .from("members")
    .select("id, email")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { success: false, message: memberError.message },
      { status: 500 },
    );
  }
  if (!member) {
    return NextResponse.json(
      { success: false, message: "Associato non trovato." },
      { status: 404 },
    );
  }

  const email = member.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Manca l'email sull'anagrafica: impossibile inviare il link di accesso.",
      },
      { status: 400 },
    );
  }

  try {
    const authResult = await ensureMemberAuthAccess(service, memberId);
    if (authResult.status === "no_email") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Manca l'email sull'anagrafica: impossibile inviare il link di accesso.",
        },
        { status: 400 },
      );
    }
    if (authResult.status === "invalid_email") {
      return NextResponse.json(
        {
          success: false,
          message: "Email non valida: impossibile creare l'accesso.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Impossibile preparare l'accesso.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  const result = await sendMagicLinkEmail(service, email, "/dashboard");

  if (result.sent) {
    return NextResponse.json({
      success: true,
      message: SUCCESS_MESSAGE,
      emailSent: true,
    });
  }

  if (result.reason === "smtp_failed") {
    return NextResponse.json(
      {
        success: false,
        message: `Impossibile inviare l'email a ${email}. Riprova tra poco.`,
        emailSent: false,
      },
      { status: 502 },
    );
  }

  if (result.reason === "no_link") {
    return NextResponse.json(
      {
        success: false,
        message: "Impossibile generare il link di accesso. Riprova.",
        emailSent: false,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      message:
        "Questa email non risulta abilitata all'accesso. Verifica anagrafica e ruoli.",
      emailSent: false,
    },
    { status: 400 },
  );
}