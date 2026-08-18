import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emailFiscalReceiptCopy,
  emitFiscalReceiptForPayment,
  getFiscalReceipt,
  type CourseMutationResult,
  type Database,
} from "@musicpro/database";

import { generateFiscalReceiptPdf } from "@/lib/lezioni/fiscal-receipt-pdf";

type ReceiptsClient = SupabaseClient<Database>;

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
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
