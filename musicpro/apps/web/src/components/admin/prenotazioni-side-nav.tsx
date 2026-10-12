"use client";

export type { PrenotazioniLista } from "@/lib/admin/prenotazioni-nav";
export { parsePrenotazioniLista } from "@/lib/admin/prenotazioni-nav";

export {
  ADMIN_PRENOTAZIONI_NAV,
  PrenotazioniWorkspaceNav,
  type PrenotazioniNavGroup,
} from "@/components/admin/prenotazioni-workspace-nav";

/** @deprecated Usa PrenotazioniWorkspaceNav */
export { PrenotazioniWorkspaceNav as PrenotazioniSideNav } from "@/components/admin/prenotazioni-workspace-nav";
