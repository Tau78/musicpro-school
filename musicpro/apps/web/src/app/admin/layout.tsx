import Link from "next/link";
import { redirect } from "next/navigation";

import { APP_NAME } from "@musicpro/shared";

import { AdminNav } from "@/components/admin/admin-nav";
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
  canManageTemplates,
} from "@/lib/admin/roles";
import { firstSettingsHref } from "@/lib/admin/settings-nav";

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
  const showDocumenti =
    canManageSettings(member.roles) || canManageTemplates(member.roles);
  const showImpostazioni =
    showQuote ||
    showSale ||
    showShop ||
    showPrenotazioniSettings ||
    showDocumenti;
  const settingsHref = firstSettingsHref({
    showQuote,
    showSale,
    showShop,
    showPrenotazioniSettings,
    showDocumenti,
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
          showRimborsi={showRimborsi}
          showImpostazioni={showImpostazioni}
          settingsHref={settingsHref}
        />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <SettingsSubNav
          showQuote={showQuote}
          showSale={showSale}
          showShop={showShop}
          showPrenotazioniSettings={showPrenotazioniSettings}
          showDocumenti={showDocumenti}
        />
        {children}
      </main>
    </div>
  );
}
