import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getMemberRoles,
} from "@musicpro/database";
import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

import { canManageStaffUsers } from "@/lib/admin/roles";
import {
  removeStaffMemberPassword,
  setStaffMemberPassword,
} from "@/lib/admin/staff-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

interface PasswordBody {
  memberId?: string;
  action?: string;
  password?: string;
}

function isStaffTarget(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria) ||
    roles.includes(MemberRole.Docente)
  );
}

export async function POST(request: Request) {
  let body: PasswordBody;
  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageStaffUsers(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
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
    const targetRoles = await getMemberRoles(service, memberId);
    if (!isStaffTarget(targetRoles)) {
      return NextResponse.json(
        {
          success: false,
          message: "Puoi gestire la password solo di utenti staff.",
        },
        { status: 403 },
      );
    }

    if (body.action === "remove") {
      await removeStaffMemberPassword(service, memberId);
      return NextResponse.json({
        success: true,
        message:
          "Password rimossa. I nuovi login con password non funzionano più; le sessioni già aperte possono restare attive fino a scadenza.",
      });
    }

    if (body.action !== "set") {
      return NextResponse.json(
        { success: false, message: "Azione non valida." },
        { status: 400 },
      );
    }

    await setStaffMemberPassword(service, memberId, body.password ?? "");
    return NextResponse.json({
      success: true,
      message: "Password aggiornata.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Operazione non riuscita.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
