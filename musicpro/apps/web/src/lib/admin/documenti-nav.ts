export const DOCUMENTI_PATH_PREFIX = "/admin/documenti";

export const DOCUMENTI_SUBSECTION_HREFS = {
  associati: "/admin/documenti/associati",
  verbali: "/admin/documenti/verbali",
  cespiti: "/admin/documenti/cespiti",
  permessi: "/admin/documenti/permessi",
} as const;

export function isDocumentiPath(pathname: string): boolean {
  return pathname.startsWith(DOCUMENTI_PATH_PREFIX);
}

export function firstDocumentiHref(flags: {
  showAssociati: boolean;
  showVerbali: boolean;
  showCespiti: boolean;
  showPermessi: boolean;
}): string {
  if (flags.showAssociati) return DOCUMENTI_SUBSECTION_HREFS.associati;
  if (flags.showVerbali) return DOCUMENTI_SUBSECTION_HREFS.verbali;
  if (flags.showCespiti) return DOCUMENTI_SUBSECTION_HREFS.cespiti;
  if (flags.showPermessi) return DOCUMENTI_SUBSECTION_HREFS.permessi;
  return DOCUMENTI_SUBSECTION_HREFS.associati;
}
