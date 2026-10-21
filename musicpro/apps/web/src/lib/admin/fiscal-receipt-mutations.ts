import type { SupabaseClient } from "@supabase/supabase-js";

type MutationResult = { success: boolean; errorMessage?: string };

export async function annulFiscalReceipt(
  client: SupabaseClient,
  receiptId: string,
): Promise<MutationResult> {
  const { data, error } = await client
    .from("fiscal_receipts")
    .update({ status: "annullata" })
    .eq("id", receiptId)
    .eq("status", "emessa")
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile annullare la ricevuta.",
    };
  }
  if (!data) {
    return {
      success: false,
      errorMessage: "Si può annullare solo una ricevuta emessa.",
    };
  }
  return { success: true };
}

export async function updateFiscalReceiptFields(
  client: SupabaseClient,
  receiptId: string,
  fields: {
    payeeName: string;
    payeeTaxCode: string | null;
    payeeEmail: string | null;
    issuedOn: string;
    method: string;
  },
): Promise<MutationResult> {
  const payeeName = fields.payeeName.trim();
  if (!payeeName) {
    return { success: false, errorMessage: "Intestatario obbligatorio." };
  }

  const { data, error } = await client
    .from("fiscal_receipts")
    .update({
      payee_name: payeeName,
      payee_tax_code: fields.payeeTaxCode?.trim() || null,
      payee_email: fields.payeeEmail?.trim() || null,
      issued_on: fields.issuedOn,
      method: fields.method,
    })
    .eq("id", receiptId)
    .eq("status", "emessa")
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare la ricevuta.",
    };
  }
  if (!data) {
    return {
      success: false,
      errorMessage: "Si può modificare solo una ricevuta emessa.",
    };
  }
  return { success: true };
}
