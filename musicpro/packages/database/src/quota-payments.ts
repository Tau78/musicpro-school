import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";
import type { QuotaPaymentItem, QuotaPaymentItemStatus } from "./bands";

type QuotaPaymentsClient = SupabaseClient<Database>;

export interface CreateQuotaPaymentCheckoutResult {
  success: boolean;
  quotaPaymentId?: string;
  totalAmountEur?: number;
  fiscalYear?: number;
  memberCount?: number;
  errorCode?: string;
  errorMessage?: string;
}

interface CreateQuotaPaymentCheckoutRpcResponse {
  success: boolean;
  quota_payment_id?: string;
  total_amount_eur?: number;
  fiscal_year?: number;
  member_count?: number;
  error_code?: string;
  error_message?: string;
}

type QuotaPaymentItemRow = {
  id: string;
  quota_payment_id: string;
  member_id: string;
  amount_eur: number;
  fiscal_year: number;
  paid_by_member_id: string;
  status: QuotaPaymentItemStatus;
};

const QUOTA_PAYMENT_ITEM_COLUMNS =
  "id, quota_payment_id, member_id, amount_eur, fiscal_year, paid_by_member_id, status";

function mapQuotaPaymentItem(row: QuotaPaymentItemRow): QuotaPaymentItem {
  return {
    id: row.id,
    quotaPaymentId: row.quota_payment_id,
    memberId: row.member_id,
    amountEur: Number(row.amount_eur),
    fiscalYear: row.fiscal_year,
    paidByMemberId: row.paid_by_member_id,
    status: row.status,
  };
}

export async function createQuotaPaymentCheckout(
  client: QuotaPaymentsClient,
  params: {
    memberIds: string[];
    fiscalYear?: number;
  },
): Promise<CreateQuotaPaymentCheckoutResult> {
  const memberIds = [...new Set(params.memberIds.map((id) => id.trim()).filter(Boolean))];

  if (memberIds.length === 0) {
    return {
      success: false,
      errorMessage: "Seleziona almeno un membro.",
    };
  }

  const { data, error } = await client.rpc("create_quota_payment_checkout", {
    p_member_ids: memberIds,
    p_fiscal_year: params.fiscalYear ?? null,
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  const result = data as CreateQuotaPaymentCheckoutRpcResponse | null;

  if (!result?.success) {
    return {
      success: false,
      errorCode: result?.error_code,
      errorMessage: result?.error_message ?? "Impossibile creare il pagamento quota.",
    };
  }

  return {
    success: true,
    quotaPaymentId: result.quota_payment_id,
    totalAmountEur:
      result.total_amount_eur == null
        ? undefined
        : Number(result.total_amount_eur),
    fiscalYear: result.fiscal_year,
    memberCount: result.member_count,
  };
}

export async function listQuotaPaymentItems(
  client: QuotaPaymentsClient,
  paymentId: string,
): Promise<QuotaPaymentItem[]> {
  const { data, error } = await client
    .from("quota_payment_items")
    .select(QUOTA_PAYMENT_ITEM_COLUMNS)
    .eq("quota_payment_id", paymentId)
    .order("member_id", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare le righe quota: ${error.message}`);
  }

  return (data ?? []).map((row) => mapQuotaPaymentItem(row as QuotaPaymentItemRow));
}
