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
  buildDigitalSignEmailContent,
  buildNotulaEmailContent,
  buildSignedNotulaSegreteriaEmailContent,
  sendReimbursementEmailViaResend,
} from "./email";
import { createReimbursementSignMagicLink } from "./sign-token";

export type SendNotulaEmailResult = {
  success: boolean;
  sent?: boolean;
  skipped?: boolean;
  message: string;
  id: string;
  recipient?: string;
};

function segreteriaRecipients(): string[] {
  const toRaw =
    process.env.EMAIL_SEGRETERIA?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "musicproeventi@gmail.com";
  return toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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

/** Sostituisce l'email notula classica: solo magic link (PDF bozza già su Drive). */
export async function sendReimbursementDigitalSignEmail(
  supabase: SupabaseClient<Database>,
  reimbursement: ReimbursementDisplay,
): Promise<SendNotulaEmailResult> {
  const member = await getMemberById(supabase, reimbursement.memberId);
  const recipient = member?.email?.trim();
  if (!recipient) {
    return {
      success: true,
      skipped: true,
      message: "Email associato mancante — invio link firma saltato",
      id: reimbursement.id,
    };
  }

  const signLink = await createReimbursementSignMagicLink(supabase, {
    reimbursementId: reimbursement.id,
    memberId: reimbursement.memberId,
    email: recipient,
  });

  const docLabel = `${reimbursement.progressive}-${reimbursement.fiscalYear} - ${reimbursement.associateName}`;
  const content = buildDigitalSignEmailContent({
    associateName: reimbursement.associateName,
    docLabel,
    signLink,
  });

  const result = await sendReimbursementEmailViaResend({
    to: recipient,
    subject: content.subject,
    html: content.html,
    text: content.text,
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
    message: "Link firma inviato",
    id: reimbursement.id,
    recipient,
  };
}

/** Dopo firma digitale: PDF aggiornato + email segreteria. */
export async function notifySegreteriaSignedReimbursement(
  supabase: SupabaseClient<Database>,
  reimbursement: ReimbursementDisplay,
): Promise<SendNotulaEmailResult> {
  const recipients = segreteriaRecipients();
  if (recipients.length === 0) {
    return {
      success: true,
      skipped: true,
      message: "Nessun destinatario segreteria",
      id: reimbursement.id,
    };
  }

  const persisted = await persistReimbursementPdf(supabase, reimbursement);
  const pdfLink =
    persisted.driveUrl ||
    (isExternalPdfUrl(reimbursement.pdfUrl) ? reimbursement.pdfUrl : null);
  const docLabel = `${reimbursement.progressive}-${reimbursement.fiscalYear} - ${reimbursement.associateName}`;
  const content = buildSignedNotulaSegreteriaEmailContent({
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

  let lastError = "";
  let anySent = false;
  for (const to of recipients) {
    const result = await sendReimbursementEmailViaResend({
      to,
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
    if (result.ok) anySent = true;
    else lastError = result.error;
  }

  if (!anySent) {
    return {
      success: false,
      message: lastError || "Invio segreteria fallito",
      id: reimbursement.id,
      recipient: recipients[0],
    };
  }

  return {
    success: true,
    sent: true,
    message: "Segreteria avvisata",
    id: reimbursement.id,
    recipient: recipients.join(", "),
  };
}
