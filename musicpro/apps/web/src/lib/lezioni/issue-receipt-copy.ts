import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emailFiscalReceiptCopy,
  emitFiscalReceiptForCreditPurchase,
  emitFiscalReceiptForPayment,
  emitFiscalReceiptForQuotaPayment,
  emitFiscalReceiptForRoomBooking,
  formatCreditsCount,
  formatEuro,
  getFiscalReceipt,
  getMemberCreditBalance,
  markFiscalReceiptEmailed,
  sendLessonFamilyEmail,
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

function creditShopMethodLabel(method: string | null | undefined): string {
  if (method === "contanti") return "Contanti";
  if (method === "bonifico") return "Bonifico";
  return "Carta";
}

function creditShopDateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const match = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function spendableCredits(
  client: ReceiptsClient,
  memberId: string,
): Promise<number | null> {
  try {
    const balance = await getMemberCreditBalance(client, memberId);
    return balance.available;
  } catch {
    const { data, error } = await client
      .from("credit_transactions")
      .select("amount")
      .eq("member_id", memberId);
    if (error || !data) return null;
    const sum = data.reduce((total, row) => total + Number(row.amount), 0);
    return Math.round(sum * 100) / 100;
  }
}

/** Emette la ricevuta shop (se l'importo è positivo) e la manda all'associato col saldo. */
export async function issueAndEmailCreditShopPurchase(
  client: ReceiptsClient,
  purchaseId: string,
  actorMemberId?: string | null,
): Promise<CourseMutationResult> {
  const id = purchaseId.trim();
  if (!id) {
    return { success: false, errorMessage: "Manca l'acquisto crediti." };
  }

  const { data: purchase, error: purchaseError } = await client
    .from("credit_purchases")
    .select(
      "id, member_id, credits_granted, amount_paid_eur, payment_status, payment_method, paid_on, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (purchaseError) {
    return {
      success: false,
      errorMessage: purchaseError.message || "Impossibile caricare l'acquisto.",
    };
  }
  if (!purchase) {
    return { success: false, errorMessage: "Acquisto crediti non trovato." };
  }
  if (purchase.payment_status !== "paid") {
    return { success: false, errorMessage: "L'acquisto crediti non è pagato." };
  }

  const amountEur = Math.round(Number(purchase.amount_paid_eur) * 100) / 100;
  let receipt: FiscalReceiptRow | null = null;

  if (amountEur > 0) {
    const emitted = await emitFiscalReceiptForCreditPurchase(client, {
      purchaseId: purchase.id,
      actorMemberId,
    });
    if (!emitted.success || !emitted.id) return emitted;
    receipt = await getFiscalReceipt(client, emitted.id);
    if (!receipt) {
      return {
        success: false,
        errorMessage: "Ricevuta emessa ma non ricaricata.",
        id: emitted.id,
      };
    }
    if (receipt.emailedAt) return { success: true, id: receipt.id };
  }

  const { data: member } = await client
    .from("members")
    .select("first_name")
    .eq("id", purchase.member_id)
    .maybeSingle();
  const greeting = member?.first_name?.trim() || "Ciao";
  const available = await spendableCredits(client, purchase.member_id);
  const paidOn = purchase.paid_on || purchase.created_at;

  const lines = [
    greeting === "Ciao" ? "Ciao," : `Ciao ${greeting},`,
    "",
    "l'acquisto crediti è andato a buon fine.",
    "",
    `Data: ${creditShopDateLabel(paidOn)}`,
    `Metodo: ${creditShopMethodLabel(purchase.payment_method)}`,
    `Importo: ${formatEuro(amountEur)}`,
    `Crediti caricati: ${formatCreditsCount(Number(purchase.credits_granted))}`,
    available == null
      ? "Saldo crediti aggiornato: non disponibile"
      : `Saldo crediti aggiornato: ${formatCreditsCount(available)}`,
    "",
  ];
  if (receipt) {
    lines.push(`In allegato la ricevuta ${receipt.code}.`, "");
  }
  lines.push("Grazie,", "MusicPro School");

  const pdf = receipt ? await generateFiscalReceiptPdf(receipt) : null;
  const result = await sendLessonFamilyEmail(client, purchase.member_id, {
    subject: receipt
      ? `Ricevuta crediti ${receipt.code} — MusicPro School`
      : "Acquisto crediti — MusicPro School",
    body: lines.join("\n"),
    attachments: pdf
      ? [
          {
            filename: pdf.filename,
            contentBase64: bytesToBase64(pdf.bytes),
          },
        ]
      : undefined,
  });

  if (result.sent === 0) {
    return {
      success: false,
      errorMessage:
        result.warnings.join(" ") || "Impossibile inviare l'email dei crediti.",
      id: receipt?.id,
    };
  }

  if (receipt) {
    const marked = await markFiscalReceiptEmailed(client, receipt.id);
    if (!marked.success) return marked;
  }

  return { success: true, id: receipt?.id, warnings: result.warnings };
}

export async function markReceiptEmailedIfSent(
  client: ReceiptsClient,
  receiptId: string,
  sent: boolean,
): Promise<void> {
  if (!sent) return;
  await markFiscalReceiptEmailed(client, receiptId);
}
