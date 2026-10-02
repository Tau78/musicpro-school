import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import { ensureMemberAuthAccess } from "@/lib/admin/staff-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  memberId?: string;
  /** Email dal form (può non essere ancora persistita). */
  email?: string | null;
}

/**
 * Dopo Salva anagrafica: se c'è email → Auth + user_id.
 * Idempotente. Non invia email all'associato.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
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

  try {
    const service = createServiceRoleClient();
    const result = await ensureMemberAuthAccess(service, memberId, {
      email: body.email,
    });

    if (result.status === "no_email") {
      return NextResponse.json({
        success: true,
        skipped: true,
        status: result.status,
        message: "Nessuna email: Auth non creato.",
      });
    }
    if (result.status === "invalid_email") {
      return NextResponse.json(
        {
          success: false,
          status: result.status,
          message: "Email non valida: impossibile creare l'accesso.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      userId: result.userId ?? null,
      message:
        result.status === "created"
          ? "Account di accesso creato (magic link / recupera password)."
          : result.status === "linked"
            ? "Account di accesso collegato."
            : result.status === "synced_email"
              ? "Email Auth allineata all'anagrafica."
              : "Account di accesso già presente.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossibile garantire l'accesso.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
