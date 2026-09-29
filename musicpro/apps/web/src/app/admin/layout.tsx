import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { DocumentiSubNav } from "@/components/admin/documenti-sub-nav";
import { SettingsSubNav } from "@/components/admin/settings-sub-nav";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessAdmin,
  canManagePenalties,
  canManageQuotas,
  canManageRooms,
  canManageSettings,
  canManageShop,
  canManageStaffUsers,
  canManageTemplates,
} from "@/lib/admin/roles";
import { getAdminShellNavConfig } from "@/lib/admin/shell-config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getAdminMember();

  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/admin");
  }

  if (!canAccessAdmin(member.roles)) {
    redirect("/dashboard?error=unauthorized");
  }

  const nav = await getAdminShellNavConfig(member.roles);
  if (!nav) {
    redirect("/dashboard?error=unauthorized");
  }

  const showQuote = canManageQuotas(member.roles);
  const showSale = canManageRooms(member.roles);
  const showShop = canManageShop(member.roles);
  const showPrenotazioniSettings =
    canManageSettings(member.roles) || canManagePenalties(member.roles);
  const showDocumentiSettings =
    canManageSettings(member.roles) || canManageTemplates(member.roles);
  const showUtenti = canManageStaffUsers(member.roles);

  return (
    <AdminShell nav={nav}>
      <Suspense fallback={children}>
        <SettingsSubNav
          showQuote={showQuote}
          showSale={showSale}
          showShop={showShop}
          showPrenotazioniSettings={showPrenotazioniSettings}
          showDocumenti={showDocumentiSettings}
          showUtenti={showUtenti}
        >
          <DocumentiSubNav>{children}</DocumentiSubNav>
        </SettingsSubNav>
      </Suspense>
    </AdminShell>
  );
}
