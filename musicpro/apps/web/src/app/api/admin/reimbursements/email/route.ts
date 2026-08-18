import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  getMemberById,
  getReimbursementById,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { canManageReimbursements } from "@/lib/admin/roles";
import {
  buildNotulaEmailContent,
  sendReimbursementEmailViaResend,
  uint8ToBase64,
} from "@/lib/reimbursements/email";
import { reimbursementPdfLink, toNotulaPdfInput } from "@/lib/reimbursements/notula";
import { generateReimbursementPdf } from "@/lib/reimbursements/pdf";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "reimbursements";

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

    const member = await getMemberById(supabase, reimbursement.memberId);
    const recipient = member?.email?.trim();
    if (!recipient) {
      results.push({
        id,
        success: true,
        skipped: true,
        message: "Email associato mancante",
      });
      continue;
    }

    const docLabel = `${reimbursement.progressive}-${reimbursement.fiscalYear} - ${reimbursement.associateName}`;
    const content = buildNotulaEmailContent({
      associateName: reimbursement.associateName,
      docLabel,
      pdfLink: reimbursementPdfLink(reimbursement),
    });

    let attachment:
      | { filename: string; content: string; content_type: string }
      | undefined;

    if (reimbursement.pdfStoragePath) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(reimbursement.pdfStoragePath);
      if (!error && data) {
        const buf = new Uint8Array(await data.arrayBuffer());
        attachment = {
          filename:
            reimbursement.pdfStoragePath.split("/").pop() || "notula.pdf",
          content: uint8ToBase64(buf),
          content_type: "application/pdf",
        };
      }
    }

    if (!attachment) {
      const pdf = await generateReimbursementPdf(
        await toNotulaPdfInput(supabase, reimbursement),
      );
      attachment = {
        filename: pdf.filename,
        content: uint8ToBase64(pdf.bytes),
        content_type: pdf.contentType,
      };
    }

    const result = await sendReimbursementEmailViaResend({
      to: recipient,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: [attachment],
    });

    if (!result.ok) {
      results.push({ id, success: false, message: result.error, recipient });
      continue;
    }

    results.push({
      id,
      success: true,
      sent: true,
      message: "Email inviata",
      recipient,
    });
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
        ? `${failed} email non inviate. Controlla RESEND_API_KEY e gli indirizzi associati.`
        : undefined,
  });
}
