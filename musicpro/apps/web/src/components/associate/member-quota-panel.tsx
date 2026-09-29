import Link from "next/link";

import {
  formatQuotaEuro,
  type AnnualQuotaSetting,
  type MemberAnnualQuota,
} from "@musicpro/database";

import { MemberQuotaSummary } from "@/components/admin/member-quota-summary";
import { QuotaPayButton } from "@/components/onboarding/quota-pay-button";
import type { MembershipStatus } from "@/lib/membership";

type MemberQuotaPanelProps = Pick<
  MembershipStatus,
  "fiscalYear" | "formCompleted" | "quotaPaid" | "quotaAmountEur"
> & {
  quotas: MemberAnnualQuota[];
  quotaSettings: AnnualQuotaSetting[];
  enrolledAt?: string | null;
};

export function MemberQuotaPanel({
  fiscalYear,
  formCompleted,
  quotaPaid,
  quotaAmountEur,
  quotas,
  quotaSettings,
  enrolledAt,
}: MemberQuotaPanelProps) {
  const amountLabel =
    quotaAmountEur != null ? formatQuotaEuro(quotaAmountEur) : "—";

  return (
    <section className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Quota associativa
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Storico versamenti e pagamento dell&apos;anno in corso.
          </p>
        </div>
        {quotaPaid ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            {fiscalYear} in regola
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            {fiscalYear} da versare
          </span>
        )}
      </div>

      <div className="mt-4">
        <MemberQuotaSummary
          quotas={quotas}
          quotaSettings={quotaSettings}
          enrolledAt={enrolledAt}
        />
      </div>

      {!quotaPaid ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          {!formCompleted ? (
            <p className="text-sm text-amber-900">
              Prima di pagare,{" "}
              <Link href="/onboarding/form" className="font-medium underline">
                completa il modulo iscrizione
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm text-amber-900">
                Importo {fiscalYear}:{" "}
                <span className="font-semibold">{amountLabel}</span>
              </p>
              <QuotaPayButton />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
