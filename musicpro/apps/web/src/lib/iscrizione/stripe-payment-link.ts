import {
  QUOTA_ASSOCIATIVA_CENTESIMI,
} from "@/lib/nexi/cod-trans";
import { mintNexiPayment, syncNexiPaymentForEnrollment } from "@/lib/nexi/mint-payment";
import { buildQuotaReturnUrl, iscrizioneReturnBase } from "@/lib/nexi/return-urls";

export { QUOTA_ASSOCIATIVA_CENTESIMI };
export type { PaymentLinkResult } from "@/lib/nexi/mint-payment";

export async function createStripePaymentLinkQuotaAssociativa(opts: {
  idIscrizione: string;
  memberId?: string;
  nome: string;
  cognome: string;
  importoCentesimi?: number;
  annoSocietario?: number;
  idempotencyKey?: string;
  returnBaseUrl?: string;
  email?: string | null;
}) {
  const idIscrizione = String(opts.idIscrizione || "").trim();
  if (!idIscrizione) {
    return { success: false, message: "ID iscrizione mancante." };
  }

  const importoCents =
    opts.importoCentesimi != null
      ? parseInt(String(opts.importoCentesimi), 10)
      : QUOTA_ASSOCIATIVA_CENTESIMI;

  if (!Number.isFinite(importoCents) || importoCents < 50) {
    return { success: false, message: "Importo quota non valido." };
  }

  const anno =
    opts.annoSocietario != null
      ? parseInt(String(opts.annoSocietario), 10)
      : new Date().getFullYear();
  const nome = String(opts.nome || "").trim();
  const cognome = String(opts.cognome || "").trim();
  const memberId = String(opts.memberId || "").trim();
  const importoDisplay = (importoCents / 100).toFixed(2);
  const returnBase = (opts.returnBaseUrl || iscrizioneReturnBase()).trim();

  const returnUrl = buildQuotaReturnUrl(returnBase, {
    idIscrizione,
    nome,
    cognome,
    importo: importoDisplay,
  });

  return mintNexiPayment({
    flow: "quota_associativa",
    amountCents: importoCents,
    returnUrl,
    description: `Quota associativa ${anno}`,
    firstName: nome,
    lastName: cognome,
    email: opts.email,
    enrollmentId: idIscrizione,
    memberId: memberId || null,
    metadata: {
      mp_flow: "quota_associativa",
      mp_id_iscrizione: idIscrizione,
    },
  });
}

export async function syncStripePaymentForEnrollment(
  _cfg: unknown,
  idIscrizione: string,
  paymentLinkId: string,
) {
  return syncNexiPaymentForEnrollment(idIscrizione, paymentLinkId);
}
