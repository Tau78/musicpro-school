import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCreditPackageById,
  getCurrentMemberWithRoles,
} from "@musicpro/database";

import { CreditPackageForm } from "@/components/admin/credit-package-form";
import {
  canDeleteCreditPackages,
  canManageShop,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PacchettoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);

  if (!currentMember || !canManageShop(currentMember.roles)) {
    redirect("/admin/rimborsi");
  }

  const creditPackage = await getCreditPackageById(supabase, id);

  if (!creditPackage) {
    notFound();
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
          {creditPackage.name}
        </h2>
      </div>

      <CreditPackageForm
        creditPackage={creditPackage}
        canDelete={canDeleteCreditPackages(currentMember.roles)}
      />
    </div>
  );
}
