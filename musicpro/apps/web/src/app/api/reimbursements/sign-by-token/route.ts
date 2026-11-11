import { NextResponse } from "next/server";

import {
  getReimbursementById,
  signReimbursement,
} from "@musicpro/database";

import { notifySegreteriaSignedReimbursement } from "@/lib/reimbursements/send";
import {
  isSignTokenValid,
  loadReimbursementSignToken,
  markReimbursementSignTokenUsed,
} from "@/lib/reimbursements/sign-token";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: Request) {
  let body: { token?: string; signaturePngBase64?: string };
  try {
    body = (await request.json()) as {
      token?: string;
      signaturePngBase64?: string;
    };
  } catch {
    return NextResponse.json(
      { success: false, message: "Body non valido" },
      { status: 400 },
    );
  }

  const token = String(body.token || "").trim();
  const png = String(body.signaturePngBase64 || "").trim();
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Token mancante" },
      { status: 400 },
    );
  }
  if (!png) {
    return NextResponse.json(
      { success: false, message: "Firma mancante" },
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
  if (!reimbursement) {
    return NextResponse.json(
      { success: false, message: "Rimborso non trovato" },
      { status: 404 },
    );
  }
  if (reimbursement.memberId !== valid.info.memberId) {
    return NextResponse.json(
      { success: false, message: "Token non corrispondente" },
      { status: 403 },
    );
  }
  if (reimbursement.signedAt) {
    await markReimbursementSignTokenUsed(supabase, token);
    return NextResponse.json({
      success: true,
      alreadySigned: true,
      message: "Notula già firmata",
    });
  }

  const signed = await signReimbursement(supabase, reimbursement.id, {
    signaturePngBase64: png,
  });
  if (!signed.success) {
    return NextResponse.json(
      {
        success: false,
        message: signed.errorMessage ?? "Firma non riuscita",
      },
      { status: 400 },
    );
  }

  await markReimbursementSignTokenUsed(supabase, token);

  const refreshed = await getReimbursementById(supabase, reimbursement.id);
  if (refreshed) {
    const notify = await notifySegreteriaSignedReimbursement(
      supabase,
      refreshed,
    );
    if (!notify.success) {
      return NextResponse.json({
        success: true,
        signed: true,
        warning: notify.message,
        message: "Firmato; avviso segreteria non inviato",
      });
    }
  }

  return NextResponse.json({
    success: true,
    signed: true,
    message: "Firma salvata. La segreteria è stata avvisata.",
  });
}
