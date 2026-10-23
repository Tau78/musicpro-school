/** Path documenti — sicuro per Client Components (niente next/headers). */

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
