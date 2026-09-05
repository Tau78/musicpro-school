import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import { creaIscrizioneContantiEInvia } from "@/lib/iscrizione/enrollment-service";
import { createClient } from "@/lib/supabase/server";

interface Body {
  nome?: string;
  cognome?: string;
  email?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
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

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageMembers(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  try {
    const result = await creaIscrizioneContantiEInvia({
      nome: body.nome || "",
      cognome: body.cognome || "",
      email: body.email || "",
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message || "Operazione fallita" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      link: result.link,
      emailSent: result.emailSent,
      memberId: result.memberId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Errore imprevisto";
    console.error("[api/admin/iscrizione-contanti]", err);
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
