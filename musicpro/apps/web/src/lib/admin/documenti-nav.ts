import type { MemberRoleValue } from "@musicpro/shared";

import {
  canAccessDocumentiRicevute,
  canAccessDocumentiSubsection,
  canManageDocumentiPermissions,
  type DocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";

export const DOCUMENTI_PATH_PREFIX = "/admin/documenti";

export const DOCUMENTI_SUBSECTION_HREFS = {
  associati: "/admin/documenti/associati",
  ricevute: "/admin/documenti/ricevute",
  verbali: "/admin/documenti/verbali",
  cespiti: "/admin/documenti/cespiti",
  permessi: "/admin/documenti/permessi",
} as const;

export function isDocumentiPath(pathname: string): boolean {
  return pathname.startsWith(DOCUMENTI_PATH_PREFIX);
}

export function buildDocumentiNavFlags(
  roles: MemberRoleValue[],
  flags: DocumentiSegreteriaFlags,
) {
  return {
    showAssociati: canAccessDocumentiSubsection(
      roles,
      "libro_associati",
      flags,
    ),
    showRicevute: canAccessDocumentiRicevute(roles),
    showVerbali: canAccessDocumentiSubsection(roles, "verbali", flags),
    showCespiti: canAccessDocumentiSubsection(roles, "libro_cespiti", flags),
    showPermessi: canManageDocumentiPermissions(roles),
  };
}

export function firstDocumentiHref(flags: {
  showAssociati: boolean;
  showRicevute: boolean;
  showVerbali: boolean;
  showCespiti: boolean;
  showPermessi: boolean;
}): string {
  if (flags.showAssociati) return DOCUMENTI_SUBSECTION_HREFS.associati;
  if (flags.showRicevute) return DOCUMENTI_SUBSECTION_HREFS.ricevute;
  if (flags.showVerbali) return DOCUMENTI_SUBSECTION_HREFS.verbali;
  if (flags.showCespiti) return DOCUMENTI_SUBSECTION_HREFS.cespiti;
  if (flags.showPermessi) return DOCUMENTI_SUBSECTION_HREFS.permessi;
  return DOCUMENTI_SUBSECTION_HREFS.associati;
}
