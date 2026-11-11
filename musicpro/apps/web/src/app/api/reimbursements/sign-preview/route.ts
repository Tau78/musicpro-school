import { NextResponse } from "next/server";

import { getReimbursementById } from "@musicpro/database";

import { toNotulaPdfInput } from "@/lib/reimbursements/notula";
import { generateReimbursementHtml } from "@/lib/reimbursements/pdf";
import {
  isSignTokenValid,
  loadReimbursementSignToken,
} from "@/lib/reimbursements/sign-token";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Token mancante" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message:
          err instanceof Error ? err.message : "Service role non configurato",
      },
      { status: 500 },
    );
  }

  const loaded = await loadReimbursementSignToken(supabase, token);
  const valid = isSignTokenValid(loaded);
  if (!valid.ok) {
    return NextResponse.json(
      { success: false, message: valid.reason },
      { status: 400 },
    );
  }

  const reimbursement = await getReimbursementById(
    supabase,
    valid.info.reimbursementId,
  );
  if (!reimbursement || reimbursement.memberId !== valid.info.memberId) {
    return NextResponse.json(
      { success: false, message: "Rimborso non trovato" },
      { status: 404 },
    );
  }

  const input = await toNotulaPdfInput(supabase, reimbursement);
  const html = generateReimbursementHtml(input);

  return NextResponse.json({
    success: true,
    alreadySigned: Boolean(reimbursement.signedAt),
    associateName: reimbursement.associateName,
    docLabel: `${reimbursement.progressive}-${reimbursement.fiscalYear}`,
    html,
  });
}
