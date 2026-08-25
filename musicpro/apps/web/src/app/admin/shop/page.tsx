import { redirect } from "next/navigation";

import { listCreditPackages } from "@musicpro/database";

import { CreditPackageList } from "@/components/admin/credit-package-list";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageShop } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminShopPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageShop(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const packages = await listCreditPackages(supabase);

  return (
    <div>
      <SettingsPageHeader
        title="Shop crediti"
        description="Pacchetti crediti disponibili per gli associati nello shop online."
      />
      <CreditPackageList packages={packages} canAdd />
    </div>
  );
}
