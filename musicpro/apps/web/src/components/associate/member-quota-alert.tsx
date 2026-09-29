import Link from "next/link";

import { formatQuotaEuro } from "@musicpro/database";

import { QuotaPayButton } from "@/components/onboarding/quota-pay-button";
import type { MembershipStatus } from "@/lib/membership";

type MemberQuotaAlertProps = Pick<
  MembershipStatus,
  "fiscalYear" | "formCompleted" | "quotaPaid" | "quotaAmountEur"
>;

export function MemberQuotaAlert({
  fiscalYear,
  formCompleted,
  quotaPaid,
  quotaAmountEur,
}: MemberQuotaAlertProps) {
  if (quotaPaid) {
    return null;
  }

  const amountLabel =
    quotaAmountEur != null ? formatQuotaEuro(quotaAmountEur) : null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 font-medium">
          Quota associativa {fiscalYear} da versare
          {amountLabel ? (
            <span className="font-normal text-amber-900"> · {amountLabel}</span>
          ) : null}
          <span className="mt-0.5 block text-xs font-normal text-amber-800/90">
            Serve per prenotare le sale prova.
          </span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!formCompleted ? (
            <Link
              href="/onboarding/form"
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/60"
            >
              Modulo iscrizione
            </Link>
          ) : (
            <QuotaPayButton
              label="Paga quota"
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
            />
          )}
          <Link
            href="/onboarding/quota"
            className="text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
          >
            Dettagli
          </Link>
        </div>
      </div>
    </div>
  );
}
