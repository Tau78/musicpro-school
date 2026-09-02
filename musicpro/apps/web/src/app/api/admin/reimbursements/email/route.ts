import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getReimbursementById,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { canManageReimbursements } from "@/lib/admin/roles";
import { sendReimbursementNotulaEmail } from "@/lib/reimbursements/send";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non autenticato" },
      { status: 401 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageReimbursements(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  let body: { ids?: string[] };
  try {
    body = (await request.json()) as { ids?: string[] };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id) => typeof id === "string" && id))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, message: "Nessun rimborso selezionato" },
      { status: 400 },
    );
  }

  const isDocenteOnly =
    currentMember.roles.includes(MemberRole.Docente) &&
    !currentMember.roles.includes(MemberRole.Admin);

  const results: Array<Record<string, unknown>> = [];

  for (const id of ids) {
    const reimbursement = await getReimbursementById(supabase, id);
    if (!reimbursement) {
      results.push({ id, success: false, message: "Non trovato" });
      continue;
    }

    if (isDocenteOnly && reimbursement.memberId !== currentMember.id) {
      results.push({ id, success: false, message: "Non autorizzato" });
      continue;
    }

    const result = await sendReimbursementNotulaEmail(supabase, reimbursement);
    results.push(result);
  }

  const sent = results.filter((r) => r.sent).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.success === false).length;

  return NextResponse.json({
    success: failed === 0,
    sent,
    skipped,
    failed,
    results,
    message:
      failed > 0
        ? `${failed} email non inviate. Controlla RESEND_API_KEY e gli indirizzi dei docenti.`
        : undefined,
  });
}
