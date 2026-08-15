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
import { generateReimbursementPdf } from "@/lib/reimbursements/pdf";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "reimbursements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function loadPdfAttachment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reimbursement: {
    id: string;
    progressive: string;
    fiscalYear: number;
    associateName: string;
    memberId: string;
    grossAmountEur: number;
    paymentMethod: string | null;
    paymentDate: string | null;
    receiptsAmountEur: number;
    generatedAt: string;
    pdfUrl: string | null;
    pdfStoragePath: string | null;
  },
): Promise<{ filename: string; content: string; content_type: string } | null> {
  if (reimbursement.pdfStoragePath) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(reimbursement.pdfStoragePath);
    if (!error && data) {
      const buf = new Uint8Array(await data.arrayBuffer());
      return {
        filename: reimbursement.pdfStoragePath.split("/").pop() || "notula.pdf",
        content: uint8ToBase64(buf),
        content_type: "application/pdf",
      };
    }
  }

  const member = await getMemberById(supabase, reimbursement.memberId);
  const pdf = await generateReimbursementPdf({
    progressive: reimbursement.progressive,
    fiscalYear: reimbursement.fiscalYear,
    associateName: reimbursement.associateName,
    address: member
      ? [
          member.addressStreet,
          [member.addressPostalCode, member.addressCity]
            .filter(Boolean)
            .join(" "),
          member.addressProvince ? `(${member.addressProvince})` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    taxCode: member?.taxCode ?? null,
    grossAmountEur: reimbursement.grossAmountEur,
    paymentMethod: reimbursement.paymentMethod,
    paymentDate: reimbursement.paymentDate,
    receiptsAmountEur: reimbursement.receiptsAmountEur,
    generatedAt: reimbursement.generatedAt,
  });

  return {
    filename: pdf.filename,
    content: uint8ToBase64(pdf.bytes),
    content_type: pdf.contentType,
  };
}

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

  const member = await getMemberById(supabase, reimbursement.memberId);
  const recipient = member?.email?.trim();
  if (!recipient) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Email associato mancante — invio saltato",
      id,
    });
  }

  const docLabel = `${reimbursement.progressive}-${reimbursement.fiscalYear} - ${reimbursement.associateName}`;
  const content = buildNotulaEmailContent({
    associateName: reimbursement.associateName,
    docLabel,
  });

  const attachment = await loadPdfAttachment(supabase, reimbursement);

  const result = await sendReimbursementEmailViaResend({
    to: recipient,
    subject: content.subject,
    html: content.html,
    text: content.text,
    attachments: attachment ? [attachment] : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: result.error, id },
      { status: 502 },
    );
  }

  if ("skipped" in result && result.skipped) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: result.reason,
      id,
      recipient,
    });
  }

  return NextResponse.json({
    success: true,
    sent: true,
    message: "Email inviata",
    id,
    recipient,
    subject: content.subject,
  });
}
