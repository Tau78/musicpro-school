import {
  getMemberById,
  isExternalPdfUrl,
  reimbursementPdfFilename,
  type Database,
  type ReimbursementDisplay,
} from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import { persistReimbursementPdf } from "./persist";
import {
  buildNotulaEmailContent,
  sendReimbursementEmailViaResend,
} from "./email";

export type SendNotulaEmailResult = {
  success: boolean;
  sent?: boolean;
  skipped?: boolean;
  message: string;
  id: string;
  recipient?: string;
};

export async function sendReimbursementNotulaEmail(
  supabase: SupabaseClient<Database>,
  reimbursement: ReimbursementDisplay,
): Promise<SendNotulaEmailResult> {
  const member = await getMemberById(supabase, reimbursement.memberId);
  const recipient = member?.email?.trim();
  if (!recipient) {
    return {
      success: true,
      skipped: true,
      message: "Email docente/associato mancante — invio saltato",
      id: reimbursement.id,
    };
  }

  const persisted = await persistReimbursementPdf(supabase, reimbursement);
  const pdfLink =
    persisted.driveUrl ||
    (isExternalPdfUrl(reimbursement.pdfUrl) ? reimbursement.pdfUrl : null);

  const docLabel = `${reimbursement.progressive}-${reimbursement.fiscalYear} - ${reimbursement.associateName}`;
  const content = buildNotulaEmailContent({
    associateName: reimbursement.associateName,
    docLabel,
    pdfLink,
  });

  const filename =
    persisted.filename ||
    reimbursementPdfFilename({
      progressive: reimbursement.progressive,
      fiscalYear: reimbursement.fiscalYear,
      associateName: reimbursement.associateName,
    });

  const result = await sendReimbursementEmailViaResend({
    to: recipient,
    subject: content.subject,
    html: content.html,
    text: content.text,
    attachments: persisted.pdfBase64
      ? [
          {
            filename,
            content: persisted.pdfBase64,
            content_type: "application/pdf",
          },
        ]
      : undefined,
  });

  if (!result.ok) {
    return {
      success: false,
      message: result.error,
      id: reimbursement.id,
      recipient,
    };
  }

  return {
    success: true,
    sent: true,
    message: "Email inviata",
    id: reimbursement.id,
    recipient,
  };
}
