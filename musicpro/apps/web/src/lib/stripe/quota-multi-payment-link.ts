import { eurosToCents } from "@/lib/nexi/cod-trans";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";

export interface QuotaMultiPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  paymentId?: string;
  totaleCents?: number;
  message?: string;
}

function buildQuotaMultiPayReturnUrl(baseUrl: string, bandId?: string): string {
  const safeBase = baseUrl.trim().replace(/[?&]$/, "");
  const sep = safeBase.includes("?") ? "&" : "?";
  const q = new URLSearchParams({ dopoPagamento: "1" });
  if (bandId) {
    q.set("bandId", bandId);
  }
  return `${safeBase}${sep}${q.toString()}`;
}

export async function createStripePaymentLinkQuotaMultiPay(opts: {
  quotaPaymentId: string;
  paidByMemberId: string;
  memberIds: string[];
  fiscalYear: number;
  totalAmountEur: number;
  memberCount: number;
  returnBaseUrl?: string;
  bandId?: string;
  idempotencyKey?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<QuotaMultiPaymentLinkResult> {
  const quotaPaymentId = String(opts.quotaPaymentId || "").trim();
  const paidByMemberId = String(opts.paidByMemberId || "").trim();

  if (!quotaPaymentId) {
    return { success: false, message: "ID pagamento quota mancante." };
  }

  const importoCents = eurosToCents(opts.totalAmountEur);
  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo quota non valido." };
  }

  const returnBase = (
    opts.returnBaseUrl || "https://school.musicproeventi.it/dashboard"
  ).trim();
  const returnUrl = buildQuotaMultiPayReturnUrl(returnBase, opts.bandId);
  const count = opts.memberCount || opts.memberIds.length;

  return mintNexiPayment({
    flow: "quota_multi_pay",
    amountCents: importoCents,
    returnUrl,
    description: `Quote associative ${opts.fiscalYear} (${count})`,
    email: opts.email,
    firstName: opts.firstName,
    lastName: opts.lastName,
    quotaPaymentId,
    memberId: paidByMemberId || null,
    metadata: {
      mp_flow: "quota_multi_pay",
      mp_quota_payment_id: quotaPaymentId,
      mp_member_ids: opts.memberIds,
    },
  });
}
