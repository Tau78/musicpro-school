import {
  ensureReceiptsNotes,
  getMemberById,
  isExternalPdfUrl,
  type ReimbursementDisplay,
} from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotulaPdfInput } from "@/lib/reimbursements/pdf";

export function memberAddress(member: {
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressProvince: string | null;
}): string {
  const parts = [
    member.addressStreet,
    [member.addressPostalCode, member.addressCity].filter(Boolean).join(" "),
    member.addressProvince ? `(${member.addressProvince})` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

export async function toNotulaPdfInput(
  client: SupabaseClient,
  reimbursement: ReimbursementDisplay,
): Promise<NotulaPdfInput> {
  const [member, receiptsNote] = await Promise.all([
    getMemberById(client, reimbursement.memberId),
    ensureReceiptsNotes(client, reimbursement),
  ]);

  return {
    progressive: reimbursement.progressive,
    fiscalYear: reimbursement.fiscalYear,
    associateName: reimbursement.associateName,
    address: member ? memberAddress(member) : null,
    taxCode: member?.taxCode ?? null,
    grossAmountEur: reimbursement.grossAmountEur,
    paymentMethod: reimbursement.paymentMethod,
    paymentDate: reimbursement.paymentDate,
    receiptsAmountEur: reimbursement.receiptsAmountEur,
    receiptsNote,
    generatedAt: reimbursement.generatedAt,
    signedAt: reimbursement.signedAt,
  };
}

export function reimbursementPdfLink(
  reimbursement: ReimbursementDisplay,
): string | null {
  return isExternalPdfUrl(reimbursement.pdfUrl) ? reimbursement.pdfUrl : null;
}
