import { Suspense } from "react";
import { redirect } from "next/navigation";

import { APP_NAME } from "@musicpro/shared";

import { AdminNav } from "@/components/admin/admin-nav";
import { DocumentiSubNav } from "@/components/admin/documenti-sub-nav";
import { SettingsSubNav } from "@/components/admin/settings-sub-nav";
import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { HeaderIdentity } from "@/components/dashboard/header-user-chip";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessAdmin,
  canAccessMemberDesk,
  canManageBookings,
  canManageMembers,
  canManagePenalties,
  canManageQuotas,
  canManageReimbursements,
  canManageRooms,
  canManageSettings,
  canManageShop,
  canManageSchoolMarket,
  canManageStaffUsers,
  isSchoolMarketDeskOnly,
  canManageTemplates,
} from "@/lib/admin/roles";
import {
  buildDocumentiNavFlags,
  firstDocumentiHref,
} from "@/lib/admin/documenti-nav";
import {
  getDocumentiSegreteriaFlags,
  hasAnyDocumentiSubsection,
} from "@/lib/admin/documenti-permissions";
import { firstSettingsHref } from "@/lib/admin/settings-nav";
import { isLessonsModuleEnabled } from "@/lib/lessons-module";
import { landingPath, uiSwitchOptions } from "@/lib/admin/ui-view";
import {
  getRequestPathname,
  getUiContext,
} from "@/lib/admin/ui-view.server";

import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import { BlurActiveOnNavigate } from "@/components/navigation/blur-active-on-navigate";

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

  const ui = await getUiContext(member.roles);
  const path = await getRequestPathname();
  if (ui.view && path) {
    const dest = landingPath(ui.view, path);
    if (dest) redirect(dest);
  }
  const uiRoles = ui.roles;

  const showRubrica = canAccessMemberDesk(uiRoles);
  const showQuote = canManageQuotas(uiRoles);
  const showRimborsi = canManageReimbursements(uiRoles);
  const showPrenotazioni = canManageBookings(uiRoles);
  const showSale = canManageRooms(uiRoles);
  const showShop = canManageShop(uiRoles);
  const showMarket = canManageSchoolMarket(uiRoles);
  const showPrenotazioniSettings =
    canManageSettings(uiRoles) || canManagePenalties(uiRoles);
  const showDocumentiSettings =
    canManageSettings(uiRoles) || canManageTemplates(uiRoles);
  const showUtenti = canManageStaffUsers(uiRoles);
  const showImpostazioni =
    showQuote ||
    showSale ||
    showShop ||
    showPrenotazioniSettings ||
    showDocumentiSettings ||
    showUtenti;
  const settingsHref =
    ui.view === "docente"
      ? "/dashboard/impostazioni"
      : firstSettingsHref({
          showQuote,
          showSale,
          showShop,
          showPrenotazioniSettings,
          showDocumenti: showDocumentiSettings,
          showUtenti,
        });

  const documentiFlags = await getDocumentiSegreteriaFlags();
  const showDocumentiSection = hasAnyDocumentiSubsection(
    uiRoles,
    documentiFlags,
  );
  const documentiHref = firstDocumentiHref(
    buildDocumentiNavFlags(uiRoles, documentiFlags),
  );
  const uiSwitch = ui.view
    ? { active: ui.view, options: uiSwitchOptions(member.roles) }
    : null;

  return (
    <div className="min-h-screen min-w-0 max-w-full overflow-x-clip bg-[var(--background)] pb-[calc(4.25rem+max(0.625rem,env(safe-area-inset-bottom,0.625rem)))] md:pb-0">
      <BlurActiveOnNavigate />
      <header className="border-b border-white/10 bg-[var(--brand)] text-white">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center gap-2 px-4 py-1.5 sm:gap-3 sm:px-6">
          <div className="min-w-0 flex-1 md:max-w-[26rem] md:flex-none">
            <HeaderIdentity
              eyebrow={APP_NAME}
              title={
                member.firstName?.trim()
                  ? `Ciao ${member.firstName.trim()}`
                  : "Amministrazione"
              }
              roles={uiSwitch ? undefined : member.roles}
              uiSwitch={uiSwitch}
            />
          </div>
          <AdminNav
            placement="inline"
            showRubrica={showRubrica}
            showLezioni={
              canManageMembers(uiRoles) && isLessonsModuleEnabled()
            }
            showPrenotazioni={showPrenotazioni}
            showDocumenti={showDocumentiSection}
            showSchoolMarket={isSchoolMarketDeskOnly(uiRoles)}
            showRimborsi={showRimborsi}
            showImpostazioni={showImpostazioni}
            showWebsite={canManageSettings(uiRoles)}
            documentiHref={documentiHref}
            settingsHref={settingsHref}
          />
          <div className="shrink-0">
            <HeaderSettingsActions
              variant="onBrand"
              settingsHref={settingsHref}
              settingsLabel={
                ui.view === "docente" ? "Impostazioni" : "Impostazioni scuola"
              }
            />
          </div>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-6xl px-4 py-3 sm:px-6 sm:py-5">
        <Suspense fallback={<AdminPageLoading />}>
          <SettingsSubNav
            showQuote={showQuote}
            showSale={showSale}
            showShop={showShop}
            showMarket={showMarket}
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
