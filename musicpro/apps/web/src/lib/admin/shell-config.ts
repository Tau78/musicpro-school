import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

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
  type DocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstSettingsHref } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";

export type AdminShellNavConfig = {
  showRubrica: boolean;
  showLezioni: boolean;
  showPrenotazioni: boolean;
  showDocumenti: boolean;
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

  const showRubrica = canManageMembers(roles);
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

  const supabase = await createClient();
  const documentiFlags = await getDocumentiSegreteriaFlags(supabase);
  const showDocumentiSection = buildShowDocumenti(roles, documentiFlags);
  const documentiHref = firstDocumentiHref({
    showAssociati: canAccessDocumentiSubsection(
      roles,
      "libro_associati",
      documentiFlags,
    ),
    showVerbali: canAccessDocumentiSubsection(
      roles,
      "verbali",
      documentiFlags,
    ),
    showCespiti: canAccessDocumentiSubsection(
      roles,
      "libro_cespiti",
      documentiFlags,
    ),
    showPermessi: canManageDocumentiPermissions(roles),
  });

  return {
    showRubrica,
    showLezioni: showRubrica,
    showPrenotazioni,
    showDocumenti: showDocumentiSection,
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
  const isAdmin = roles.includes(MemberRole.Admin);
  return (
    isAdmin ||
    (canManageSettings(roles) &&
      hasAnyDocumentiSubsection(roles, documentiFlags))
  );
}
