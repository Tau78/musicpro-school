import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getReimbursementById,
  signReimbursement,
} from "@musicpro/database";

import { notifySegreteriaSignedReimbursement } from "@/lib/reimbursements/send";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

  let signaturePngBase64: string | null = null;
  try {
    const body = (await request.json().catch(() => null)) as {
      signaturePngBase64?: string;
    } | null;
    signaturePngBase64 = body?.signaturePngBase64?.trim() || null;
  } catch {
    signaturePngBase64 = null;
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

  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return NextResponse.json(
      { success: false, message: "Profilo associato non collegato" },
      { status: 403 },
    );
  }

  const reimbursement = await getReimbursementById(supabase, id);
  if (!reimbursement) {
    return NextResponse.json(
      { success: false, message: "Rimborso non trovato" },
      { status: 404 },
    );
  }

  if (reimbursement.memberId !== member.id) {
    return NextResponse.json(
      { success: false, message: "Puoi firmare solo le tue notule." },
      { status: 403 },
    );
  }

  const result = await signReimbursement(supabase, id, {
    signaturePngBase64,
  });
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: result.errorMessage ?? "Firma non riuscita" },
      { status: 400 },
    );
  }

  if (reimbursement.digitalSignRequested) {
    try {
      const admin = createServiceRoleClient();
      const refreshed = await getReimbursementById(admin, id);
      if (refreshed) {
        await notifySegreteriaSignedReimbursement(admin, refreshed);
      }
    } catch {
      /* best-effort notify */
    }
  }

  return NextResponse.json({ success: true, id, signed: true });
}
