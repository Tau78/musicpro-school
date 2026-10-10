import { eurosToCents } from "@/lib/nexi/cod-trans";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";
import { buildCreditShopReturnUrl } from "@/lib/nexi/return-urls";

export interface CreditShopPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  paymentId?: string;
  totaleCents?: number;
  message?: string;
}

export async function createNexiCreditShopPaymentLink(opts: {
  memberId: string;
  packageId: string;
  packageName: string;
  credits: number;
  priceEur: number;
  memberName?: string;
  email?: string | null;
  idempotencyKey?: string;
  returnBaseUrl?: string;
}): Promise<CreditShopPaymentLinkResult> {
  const memberId = String(opts.memberId || "").trim();
  const packageId = String(opts.packageId || "").trim();

  if (!memberId) {
    return { success: false, message: "ID associato mancante." };
  }
  if (!packageId) {
    return { success: false, message: "ID pacchetto mancante." };
  }

  const importoCents = eurosToCents(opts.priceEur);
  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo pacchetto non valido." };
  }

  const returnBase = (
    opts.returnBaseUrl || "https://school.musicproeventi.it/dashboard/shop"
  ).trim();
  const nameParts = String(opts.memberName || "").trim().split(/\s+/);

  return mintNexiPayment({
    flow: "shop_credit_package",
    amountCents: importoCents,
    returnUrl: buildCreditShopReturnUrl(returnBase),
    description: `${opts.packageName} (${opts.credits} crediti)`,
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: opts.email,
    memberId,
    packageId,
    metadata: {
      mp_flow: "shop_credit_package",
      mp_package_id: packageId,
      mp_member_id: memberId,
    },
  });
}
