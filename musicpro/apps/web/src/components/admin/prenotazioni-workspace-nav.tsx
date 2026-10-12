"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  AdminWorkspaceNav,
  type AdminWorkspaceNavGroup,
} from "@/components/admin/admin-workspace-nav";
import { parsePrenotazioniLista } from "@/lib/admin/prenotazioni-nav";

export type PrenotazioniNavGroup = AdminWorkspaceNavGroup;

export const ADMIN_PRENOTAZIONI_NAV: readonly PrenotazioniNavGroup[] = [
  {
    label: "Calendario",
    items: [
      { href: "/admin/prenotazioni/calendario", label: "Calendario" },
    ],
  },
  {
    label: "Liste",
    items: [
      { href: "/admin/prenotazioni/lista", label: "Da approvare" },
      { href: "/admin/prenotazioni/lista?lista=prossime", label: "Prossime" },
      { href: "/admin/prenotazioni/lista?lista=tutte", label: "Tutte" },
      { href: "/admin/prenotazioni/lista?lista=cestino", label: "Cestino" },
    ],
  },
  {
    label: "Report",
    items: [{ href: "/admin/prenotazioni/report", label: "Report" }],
  },
] as const;

function IconCalendar({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function IconInbox({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 13h-6l-2 3H10l-2-3H2" />
      <path d="M5.45 5.11 2 13v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-7.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function IconList({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function IconTrash({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function IconChart({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 19V5M4 19h16M8 17V9M12 17V7M16 17v-4" />
    </svg>
  );
}

const ITEM_ICONS: Record<string, ReactNode> = {
  Calendario: <IconCalendar />,
  "Da approvare": <IconInbox />,
  Prossime: <IconList />,
  Tutte: <IconList />,
  Cestino: <IconTrash />,
  Report: <IconChart />,
};

function resolvePrenotazioniActiveHref(
  pathname: string,
  lista: ReturnType<typeof parsePrenotazioniLista>,
): string | null {
  if (pathname === "/admin/prenotazioni/calendario") {
    return "/admin/prenotazioni/calendario";
  }
  if (pathname === "/admin/prenotazioni/report") {
    return "/admin/prenotazioni/report";
  }
  if (pathname === "/admin/prenotazioni/lista") {
    if (lista === "da-approvare") return "/admin/prenotazioni/lista";
    return `/admin/prenotazioni/lista?lista=${lista}`;
  }
  return null;
}

export function PrenotazioniWorkspaceNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lista = parsePrenotazioniLista(searchParams.get("lista"));
  const activeHref = useMemo(
    () => resolvePrenotazioniActiveHref(pathname, lista),
    [pathname, lista],
  );

  return (
    <AdminWorkspaceNav
      title="Prenotazioni"
      groups={ADMIN_PRENOTAZIONI_NAV}
      activeHref={activeHref}
      segmentAriaLabel="Sezioni prenotazioni"
      itemIcons={ITEM_ICONS}
    />
  );
}
