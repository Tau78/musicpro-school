import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

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
    if (body.action === "remove") {
      await removeStaffMemberPassword(service, memberId);
      return NextResponse.json({
        success: true,
        message: "Password rimossa. L'accesso con password non è più valido.",
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
