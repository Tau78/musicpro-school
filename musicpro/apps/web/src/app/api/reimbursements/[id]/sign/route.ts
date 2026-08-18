import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getReimbursementById,
  signReimbursement,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: "ID mancante" },
      { status: 400 },
    );
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

  const result = await signReimbursement(supabase, id);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: result.errorMessage ?? "Firma non riuscita" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, id, signed: true });
}
