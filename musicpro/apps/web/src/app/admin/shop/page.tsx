import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatCreditsCount,
  listCreditPackages,
  listMemberAvailableCredits,
} from "@musicpro/database";

import { CreditPackageList } from "@/components/admin/credit-package-list";
import { CreditPurchasesPanel } from "@/components/admin/credit-purchases-panel";
import { ShopSettingsTabs } from "@/components/admin/shop-settings-tabs";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageShop } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{ sezione?: string }>;
}

export default async function AdminShopPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageShop(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const { sezione } = await searchParams;
  const section = sezione === "storico" ? "storico" : "pacchetti";
  const [packages, memberCredits] = await Promise.all([
    listCreditPackages(supabase),
    listMemberAvailableCredits(supabase).catch(() => ({}) as Record<string, number>),
  ]);

  const creditsInCirculation = Object.values(memberCredits).reduce(
    (sum, value) => sum + Math.max(0, value),
    0,
  );
  const holdersWithBalance = Object.values(memberCredits).filter(
    (value) => value > 0,
  ).length;

  return (
    <div>
      <SettingsPageHeader
        title="Crediti"
        description="Totale in circolazione, pacchetti/promozioni dello shop e storico acquisti."
      />

      <section className="mb-5 grid grid-cols-2 gap-2.5 sm:max-w-lg">
        <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
          <p className="text-xs text-neutral-500">In circolazione</p>
          <p className="text-sm font-semibold text-[var(--brand)]">
            {formatCreditsCount(creditsInCirculation)}
          </p>
        </div>
        <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
          <p className="text-xs text-neutral-500">Associati con saldo</p>
          <p className="text-sm font-semibold text-neutral-900">
            {holdersWithBalance}
          </p>
        </div>
      </section>

      <p className="mb-4 text-xs text-neutral-500">
        Utilizzo sale e report:{" "}
        <Link
          href="/admin/prenotazioni/report"
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Report prenotazioni
        </Link>
        .
      </p>

      <ShopSettingsTabs section={section} />
      {section === "storico" ? (
        <CreditPurchasesPanel />
      ) : (
        <CreditPackageList packages={packages} canAdd />
      )}
    </div>
  );
}
