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

  /** undefined = usa il flag sul rimborso; true/false = forzato dal client */
  let digitalSignOverride: boolean | undefined;
  try {
    const body = (await request.json().catch(() => null)) as {
      digitalSign?: boolean;
    } | null;
    if (body && typeof body.digitalSign === "boolean") {
      digitalSignOverride = body.digitalSign;
    }
  } catch {
    digitalSignOverride = undefined;
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

  // Override esplicito, altrimenti il flag sul rimborso; se già firmata → notula PDF.
  const wantDigital =
    digitalSignOverride !== undefined
      ? digitalSignOverride
      : reimbursement.digitalSignRequested;
  const sendDigital = wantDigital && !reimbursement.signedAt;

  const result = sendDigital
    ? await sendReimbursementDigitalSignEmail(supabase, reimbursement)
    : await sendReimbursementNotulaEmail(supabase, reimbursement);

  return NextResponse.json(result, {
    status: result.success ? 200 : 502,
  });
}
