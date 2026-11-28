import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getMemberCreditBalance,
  listActiveCreditPackages,
  listMemberCreditTransactions,
} from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { UiRoleSwitchSlot } from "@/components/dashboard/ui-role-switch-slot";
import { CreditShopPackages } from "@/components/shop/credit-shop-packages";
import { MemberCreditHistory } from "@/components/shop/member-credit-history";
import { createClient } from "@/lib/supabase/server";
import { redirectForUiView } from "@/lib/admin/ui-view.server";

interface ShopPageProps {
  searchParams: Promise<{ dopoPagamento?: string }>;
}

export default async function DashboardShopPage({ searchParams }: ShopPageProps) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  await redirectForUiView(member.roles, "/dashboard/shop");

  const params = await searchParams;
  const paymentComplete = params.dopoPagamento === "1";

  const [balance, packages, transactions] = await Promise.all([
    getMemberCreditBalance(supabase, member.id),
    listActiveCreditPackages(supabase),
    listMemberCreditTransactions(supabase, member.id, 80).catch(() => []),
  ]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex min-w-0 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="truncate text-xl font-semibold text-[var(--brand)]">
              Shop crediti
            </h1>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Suspense fallback={null}>
              <UiRoleSwitchSlot tone="onLight" when="associato" />
            </Suspense>
            <Link
              href="/dashboard/impostazioni"
              className="text-sm text-neutral-600 hover:text-[var(--brand)]"
            >
              Impostazioni
            </Link>
            <HeaderSettingsActions />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          ← Dashboard
        </Link>

        {paymentComplete ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            Pagamento ricevuto. I crediti saranno aggiornati a breve.
          </div>
        ) : null}

        <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Il tuo saldo
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-neutral-500">Disponibili</dt>
              <dd className="mt-1 text-2xl font-semibold text-neutral-900">
                {balance.available}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Bloccati</dt>
              <dd className="mt-1 text-2xl font-semibold text-neutral-900">
                {balance.held}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Totale</dt>
              <dd className="mt-1 text-2xl font-semibold text-neutral-900">
                {balance.total}
              </dd>
            </div>
          </dl>
          <MemberCreditHistory transactions={transactions} />
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Pacchetti disponibili
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Acquista crediti per prenotare le sale prova. Pagamento sicuro con carta.
          </p>
          <CreditShopPackages packages={packages} />
        </section>
      </div>
    </main>
  );
}
