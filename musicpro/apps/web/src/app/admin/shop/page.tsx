import { redirect } from "next/navigation";

import { listCreditPackages } from "@musicpro/database";

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
  const packages = await listCreditPackages(supabase);

  return (
    <div>
      <SettingsPageHeader
        title="Shop crediti"
        description="Pacchetti in vendita e storico acquisti degli associati."
      />
      <ShopSettingsTabs section={section} />
      {section === "storico" ? (
        <CreditPurchasesPanel />
      ) : (
        <CreditPackageList packages={packages} canAdd />
      )}
    </div>
  );
}
