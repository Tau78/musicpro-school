import Link from "next/link";
import { redirect } from "next/navigation";

import { CreditPackageForm } from "@/components/admin/credit-package-form";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageShop } from "@/lib/admin/roles";

export default async function NuovoPacchettoPage() {
  const member = await getAdminMember();

  if (!member || !canManageShop(member.roles)) {
    redirect("/admin/rimborsi");
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/shop"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna allo shop
        </Link>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--brand)]">
          Nuovo pacchetto crediti
        </h2>
      </div>

      <CreditPackageForm />
    </div>
  );
}
