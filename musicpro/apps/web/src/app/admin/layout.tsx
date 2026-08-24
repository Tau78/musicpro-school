import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { APP_NAME } from "@musicpro/shared";

import { AdminNav } from "@/components/admin/admin-nav";
import { DocumentiSubNav } from "@/components/admin/documenti-sub-nav";
import { SettingsSubNav } from "@/components/admin/settings-sub-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessAdmin,
  canManageBookings,
  canManageMembers,
  canManagePenalties,
  canManageQuotas,
  canManageReimbursements,
  canManageRooms,
  canManageSettings,
  canManageShop,
  canManageStaffUsers,
  canManageTemplates,
} from "@/lib/admin/roles";
import { firstDocumentiHref } from "@/lib/admin/documenti-nav";
import {
  canAccessDocumentiSubsection,
  canManageDocumentiPermissions,
  getDocumentiSegreteriaFlags,
  hasAnyDocumentiSubsection,
} from "@/lib/admin/documenti-permissions";
import { firstSettingsHref } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";
import { MemberRole } from "@musicpro/shared";

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

  const showRubrica = canManageMembers(member.roles);
  const showQuote = canManageQuotas(member.roles);
  const showRimborsi = canManageReimbursements(member.roles);
  const showPrenotazioni = canManageBookings(member.roles);
  const showSale = canManageRooms(member.roles);
  const showShop = canManageShop(member.roles);
  const showPrenotazioniSettings =
    canManageSettings(member.roles) || canManagePenalties(member.roles);
  const showDocumentiSettings =
    canManageSettings(member.roles) || canManageTemplates(member.roles);
  const showUtenti = canManageStaffUsers(member.roles);
  const showImpostazioni =
    showQuote ||
    showSale ||
    showShop ||
    showPrenotazioniSettings ||
    showDocumentiSettings ||
    showUtenti;
  const settingsHref = firstSettingsHref({
    showQuote,
    showSale,
    showShop,
    showPrenotazioniSettings,
    showDocumenti: showDocumentiSettings,
    showUtenti,
  });

  const supabase = await createClient();
  const documentiFlags = await getDocumentiSegreteriaFlags(supabase);
  const isAdmin = member.roles.includes(MemberRole.Admin);
  const showDocumentiSection =
    isAdmin ||
    (canManageSettings(member.roles) &&
      hasAnyDocumentiSubsection(member.roles, documentiFlags));
  const showDocumentiAssociati = canAccessDocumentiSubsection(
    member.roles,
    "libro_associati",
    documentiFlags,
  );
  const showDocumentiVerbali = canAccessDocumentiSubsection(
    member.roles,
    "verbali",
    documentiFlags,
  );
  const showDocumentiCespiti = canAccessDocumentiSubsection(
    member.roles,
    "libro_cespiti",
    documentiFlags,
  );
  const showDocumentiPermessi = canManageDocumentiPermissions(member.roles);
  const documentiHref = firstDocumentiHref({
    showAssociati: showDocumentiAssociati,
    showVerbali: showDocumentiVerbali,
    showCespiti: showDocumentiCespiti,
    showPermessi: showDocumentiPermessi,
  });

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20 md:pb-0">
      <header className="bg-[var(--brand)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold">Amministrazione</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              Dashboard
            </Link>
            <SignOutButton className="border-white/30 text-white hover:bg-white/10" />
          </div>
        </div>
        <AdminNav
          showRubrica={showRubrica}
          showLezioni={showRubrica}
          showPrenotazioni={showPrenotazioni}
          showDocumenti={showDocumentiSection}
          showRimborsi={showRimborsi}
          showImpostazioni={showImpostazioni}
          documentiHref={documentiHref}
          settingsHref={settingsHref}
        />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
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
      </main>
    </div>
  );
}
