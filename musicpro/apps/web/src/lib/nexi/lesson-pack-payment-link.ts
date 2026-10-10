import { QUOTA_ASSOCIATIVA_CENTESIMI, eurosToCents } from "@/lib/nexi/cod-trans";
import { mintNexiPayment } from "@/lib/nexi/mint-payment";
import {
  authPublicOrigin,
  isLocalDevOrigin,
} from "@/lib/auth/redirect-url";

export const LESSON_PACK_FLOW = "lesson_pack";

export interface LessonPackPaymentLinkResult {
  success: boolean;
  url?: string;
  stripeId?: string;
  paymentId?: string;
  totaleCents?: number;
  message?: string;
}

function usablePublicUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isLocalDevOrigin(trimmed)) return "";
  return trimmed;
}

function buildLessonPackReturnUrl(optsReturnUrl?: string): string {
  const explicit = usablePublicUrl(optsReturnUrl || "");
  if (explicit) return explicit;
  return `${authPublicOrigin(process.env)}/admin/lezioni/rette?pagato=1`;
}

export async function createLessonPackPaymentLink(opts: {
  paymentId: string;
  enrollmentId: string;
  memberId: string;
  studentName: string;
  packAmountEur: number;
  includeQuota: boolean;
  quotaAmountCents?: number;
  returnUrl?: string;
  email?: string | null;
  idempotencyKey?: string;
}): Promise<LessonPackPaymentLinkResult> {
  const paymentId = String(opts.paymentId || "").trim();
  const enrollmentId = String(opts.enrollmentId || "").trim();
  const memberId = String(opts.memberId || "").trim();

  if (!paymentId) {
    return { success: false, message: "ID pagamento mancante." };
  }
  if (!enrollmentId) {
    return { success: false, message: "ID iscrizione corso mancante." };
  }
  if (!memberId) {
    return { success: false, message: "ID associato mancante." };
  }

  const packCents = eurosToCents(opts.packAmountEur);
  if (!Number.isFinite(packCents) || packCents < 50) {
    return { success: false, message: "Importo pacchetto non valido." };
  }

  const quotaCents = opts.includeQuota
    ? opts.quotaAmountCents != null
      ? parseInt(String(opts.quotaAmountCents), 10)
      : QUOTA_ASSOCIATIVA_CENTESIMI
    : 0;

  if (opts.includeQuota && (!Number.isFinite(quotaCents) || quotaCents < 50)) {
    return { success: false, message: "Importo quota non valido." };
  }

  const totaleCents = packCents + quotaCents;
  const studentName = String(opts.studentName || "").trim();
  const nameParts = studentName.split(/\s+/);
  const description = opts.includeQuota
    ? "Pacchetto lezioni + quota associativa"
    : "Pacchetto lezioni";

  return mintNexiPayment({
    flow: "lesson_pack",
    amountCents: totaleCents,
    returnUrl: buildLessonPackReturnUrl(opts.returnUrl),
    description,
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: opts.email,
    memberId,
    lessonPackPaymentId: paymentId,
    metadata: {
      mp_flow: LESSON_PACK_FLOW,
      mp_payment_id: paymentId,
      mp_enrollment_id: enrollmentId,
      mp_member_id: memberId,
      include_quota: opts.includeQuota,
    },
  });
}
