import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatQuotaEuro,
  getCurrentMemberWithRoles,
} from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { QuotaPayButton } from "@/components/onboarding/quota-pay-button";
import { getMembershipStatus } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

interface QuotaPageProps {
  searchParams: Promise<{ dopoPagamento?: string }>;
}

export default async function OnboardingQuotaPage({ searchParams }: QuotaPageProps) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?redirect=/onboarding/quota");
  }

  const status = await getMembershipStatus(supabase, member.id);
  const params = await searchParams;
  const paymentComplete = params.dopoPagamento === "1";

  if (status.quotaPaid) {
    redirect("/dashboard");
  }

  const amountLabel =
    status.quotaAmountEur != null
      ? formatQuotaEuro(status.quotaAmountEur)
      : "—";

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Quota associativa {status.fiscalYear}
            </h1>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {!status.formCompleted ? (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Prima di pagare la quota,{" "}
            <Link href="/onboarding/form" className="font-medium underline">
              completa il modulo iscrizione
            </Link>
            .
          </div>
        ) : null}

        {paymentComplete ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            Pagamento ricevuto. L&apos;aggiornamento della quota può richiedere
            qualche secondo: ricarica la pagina o torna alla dashboard.
          </div>
        ) : null}

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Versa la quota associativa
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            La quota annuale è obbligatoria per prenotare le sale prova e
            partecipare alle band.
          </p>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-neutral-100 pb-3">
              <dt className="text-neutral-500">Anno</dt>
              <dd className="font-medium">{status.fiscalYear}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Importo</dt>
              <dd className="text-2xl font-semibold text-[var(--brand)]">
                {amountLabel}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <QuotaPayButton disabled={!status.formCompleted} />
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Pagamento sicuro con carta. Riceverai conferma via email.
          </p>
        </section>
      </div>
    </main>
  );
}
