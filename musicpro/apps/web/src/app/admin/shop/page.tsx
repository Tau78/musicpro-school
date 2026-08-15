import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles, listCreditPackages } from "@musicpro/database";

import { CreditPackageList } from "@/components/admin/credit-package-list";
import { canManageShop } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminShopPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageShop(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const packages = await listCreditPackages(supabase);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Shop crediti
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Gestisci i pacchetti crediti disponibili nello shop associati.
        </p>
      </div>

      <CreditPackageList packages={packages} canAdd />
    </div>
  );
}
