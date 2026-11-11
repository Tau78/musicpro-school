import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getReimbursementById,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { canManageReimbursements } from "@/lib/admin/roles";
import {
  sendReimbursementDigitalSignEmail,
  sendReimbursementNotulaEmail,
} from "@/lib/reimbursements/send";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
  }

  let digitalSign = false;
  try {
    const body = (await request.json().catch(() => null)) as {
      digitalSign?: boolean;
    } | null;
    digitalSign = Boolean(body?.digitalSign);
  } catch {
    digitalSign = false;
  }

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

  const isDocenteOnly =
    currentMember.roles.includes(MemberRole.Docente) &&
    !currentMember.roles.includes(MemberRole.Admin);

  const reimbursement = await getReimbursementById(supabase, id);
  if (!reimbursement) {
    return NextResponse.json(
      { success: false, message: "Rimborso non trovato" },
      { status: 404 },
    );
  }

  if (isDocenteOnly && reimbursement.memberId !== currentMember.id) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  const useDigital =
    digitalSign || reimbursement.digitalSignRequested;

  const result = useDigital
    ? await sendReimbursementDigitalSignEmail(supabase, reimbursement)
    : await sendReimbursementNotulaEmail(supabase, reimbursement);

  return NextResponse.json(result, {
    status: result.success ? 200 : 502,
  });
}
