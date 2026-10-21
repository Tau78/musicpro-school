import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emailFiscalReceiptCopy,
  emitFiscalReceiptForPayment,
  emitFiscalReceiptForQuotaPayment,
  emitFiscalReceiptForRoomBooking,
  getFiscalReceipt,
  markFiscalReceiptEmailed,
  type CourseMutationResult,
  type Database,
  type EmitFiscalReceiptForQuotaInput,
  type FiscalReceiptRow,
} from "@musicpro/database";

import { generateFiscalReceiptPdf } from "@/lib/lezioni/fiscal-receipt-pdf";
import type { EnrollmentAttachment } from "@/lib/iscrizione/email-transport";

type ReceiptsClient = SupabaseClient<Database>;

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

export async function fiscalReceiptEnrollmentAttachment(
  row: FiscalReceiptRow,
): Promise<EnrollmentAttachment> {
  const pdf = await generateFiscalReceiptPdf(row);
  return {
    filename: pdf.filename,
    content: bytesToBase64(pdf.bytes),
    content_type: "application/pdf",
  };
}

/** Emette (se serve) e restituisce allegato PDF senza inviare email separata. */
export async function ensureFiscalReceiptAttachment(
  client: ReceiptsClient,
  emit: () => Promise<CourseMutationResult>,
): Promise<{ attachment: EnrollmentAttachment; receiptId: string } | null> {
  const emitted = await emit();
  if (!emitted.success || !emitted.id) return null;
  const row = await getFiscalReceipt(client, emitted.id);
  if (!row || row.status !== "emessa") return null;
  const attachment = await fiscalReceiptEnrollmentAttachment(row);
  return { attachment, receiptId: row.id };
}

export async function issueAndEmailReceiptCopy(
  client: ReceiptsClient,
  paymentId: string,
  actorMemberId?: string | null,
): Promise<CourseMutationResult> {
  const emitted = await emitFiscalReceiptForPayment(client, {
    paymentId,
    actorMemberId,
  });
  if (!emitted.success || !emitted.id) return emitted;

  const row = await getFiscalReceipt(client, emitted.id);
  if (!row) {
    return {
      success: false,
      errorMessage: "Ricevuta emessa ma non ricaricata.",
      id: emitted.id,
    };
  }

  const pdf = await generateFiscalReceiptPdf(row);
  return emailFiscalReceiptCopy(client, {
    receiptId: row.id,
    attachments: [
      {
        filename: pdf.filename,
        contentBase64: bytesToBase64(pdf.bytes),
      },
    ],
  });
}

export async function issueAndEmailReceiptForRoomBooking(
  client: ReceiptsClient,
  bookingId: string,
  actorMemberId?: string | null,
): Promise<CourseMutationResult> {
  const emitted = await emitFiscalReceiptForRoomBooking(client, {
    bookingId,
    actorMemberId,
  });
  if (!emitted.success || !emitted.id) return emitted;
  const row = await getFiscalReceipt(client, emitted.id);
  if (!row) {
    return {
      success: false,
      errorMessage: "Ricevuta emessa ma non ricaricata.",
      id: emitted.id,
    };
  }
  const pdf = await generateFiscalReceiptPdf(row);
  return emailFiscalReceiptCopy(client, {
    receiptId: row.id,
    attachments: [
      {
        filename: pdf.filename,
        contentBase64: bytesToBase64(pdf.bytes),
      },
    ],
  });
}

export async function issueAndEmailReceiptForQuota(
  client: ReceiptsClient,
  input: EmitFiscalReceiptForQuotaInput,
): Promise<CourseMutationResult> {
  const emitted = await emitFiscalReceiptForQuotaPayment(client, input);
  if (!emitted.success || !emitted.id) return emitted;
  const row = await getFiscalReceipt(client, emitted.id);
  if (!row) {
    return {
      success: false,
      errorMessage: "Ricevuta emessa ma non ricaricata.",
      id: emitted.id,
    };
  }
  const pdf = await generateFiscalReceiptPdf(row);
  return emailFiscalReceiptCopy(client, {
    receiptId: row.id,
    attachments: [
      {
        filename: pdf.filename,
        contentBase64: bytesToBase64(pdf.bytes),
      },
    ],
  });
}

/** Allegato ricevuta per email di conferma (segna emailed_at se invio riuscito). */
export async function fiscalReceiptAttachmentForRoomBooking(
  client: ReceiptsClient,
  bookingId: string,
): Promise<{ attachment: EnrollmentAttachment; receiptId: string } | null> {
  return ensureFiscalReceiptAttachment(client, () =>
    emitFiscalReceiptForRoomBooking(client, { bookingId }),
  );
}

export async function markReceiptEmailedIfSent(
  client: ReceiptsClient,
  receiptId: string,
  sent: boolean,
): Promise<void> {
  if (!sent) return;
  await markFiscalReceiptEmailed(client, receiptId);
}
