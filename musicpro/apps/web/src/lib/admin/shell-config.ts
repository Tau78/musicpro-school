import { type MemberRoleValue } from "@musicpro/shared";

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
  isSchoolMarketDeskOnly,
  canManageStaffUsers,
  canManageTemplates,
} from "@/lib/admin/roles";
import {
  buildDocumentiNavFlags,
  firstDocumentiHref,
} from "@/lib/admin/documenti-nav";
import {
  getDocumentiSegreteriaFlags,
  hasAnyDocumentiSubsection,
  type DocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstSettingsHref } from "@/lib/admin/settings-nav";
import { isLessonsModuleEnabled } from "@/lib/lessons-module";
export type AdminShellNavConfig = {
  showRubrica: boolean;
  showLezioni: boolean;
  showPrenotazioni: boolean;
  showDocumenti: boolean;
  showSchoolMarket: boolean;
  showRimborsi: boolean;
  showImpostazioni: boolean;
  showWebsite: boolean;
  documentiHref: string;
  settingsHref: string;
};

export async function getAdminShellNavConfig(
  roles: MemberRoleValue[],
): Promise<AdminShellNavConfig | null> {
  if (!canAccessAdmin(roles)) {
    return null;
  }

  const showRubrica = canAccessMemberDesk(roles);
  const showQuote = canManageQuotas(roles);
  const showRimborsi = canManageReimbursements(roles);
  const showPrenotazioni = canManageBookings(roles);
  const showSale = canManageRooms(roles);
  const showShop = canManageShop(roles);
  const showPrenotazioniSettings =
    canManageSettings(roles) || canManagePenalties(roles);
  const showDocumentiSettings =
    canManageSettings(roles) || canManageTemplates(roles);
  const showUtenti = canManageStaffUsers(roles);
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

  const documentiFlags = await getDocumentiSegreteriaFlags();
  const showDocumentiSection = buildShowDocumenti(roles, documentiFlags);
  const documentiHref = firstDocumentiHref(
    buildDocumentiNavFlags(roles, documentiFlags),
  );

  return {
    showRubrica,
    showLezioni: canManageMembers(roles) && isLessonsModuleEnabled(),
    showPrenotazioni,
    showDocumenti: showDocumentiSection,
    showSchoolMarket: isSchoolMarketDeskOnly(roles),
    showRimborsi,
    showImpostazioni,
    showWebsite: canManageSettings(roles),
    documentiHref,
    settingsHref,
  };
}

function buildShowDocumenti(
  roles: MemberRoleValue[],
  documentiFlags: DocumentiSegreteriaFlags,
): boolean {
  return hasAnyDocumentiSubsection(roles, documentiFlags);
}
