"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  AdminWorkspaceNav,
  type AdminWorkspaceNavGroup,
} from "@/components/admin/admin-workspace-nav";
import { DOCUMENTI_SUBSECTION_HREFS } from "@/lib/admin/documenti-nav";

export type DocumentiNavGroup = AdminWorkspaceNavGroup;

function resolveActiveHref(
  pathname: string,
  groups: readonly DocumentiNavGroup[],
): string | null {
  return (
    groups
      .flatMap((group) => group.items)
      .filter(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
}

function buildDocumentiGroups(flags: {
  showAssociati: boolean;
  showRicevute: boolean;
  showVerbali: boolean;
  showCespiti: boolean;
  showPermessi: boolean;
}): DocumentiNavGroup[] {
  const registriItems: DocumentiNavGroup["items"][number][] = [];
  if (flags.showAssociati) {
    registriItems.push({
      href: DOCUMENTI_SUBSECTION_HREFS.associati,
      label: "Libro Associati",
    });
  }
  if (flags.showRicevute) {
    registriItems.push({
      href: DOCUMENTI_SUBSECTION_HREFS.ricevute,
      label: "Ricevute",
    });
  }
  if (flags.showVerbali) {
    registriItems.push({
      href: DOCUMENTI_SUBSECTION_HREFS.verbali,
      label: "Verbali",
    });
  }
  if (flags.showCespiti) {
    registriItems.push({
      href: DOCUMENTI_SUBSECTION_HREFS.cespiti,
      label: "Libro Cespiti",
    });
  }

  const groups: DocumentiNavGroup[] = [];
  if (registriItems.length > 0) {
    groups.push({ label: "Registri", items: registriItems });
  }
  if (flags.showPermessi) {
    groups.push({
      label: "Accesso",
      items: [
        {
          href: DOCUMENTI_SUBSECTION_HREFS.permessi,
          label: "Permessi",
        },
      ],
    });
  }
  return groups;
}

function IconBook({ className = "h-3.5 w-3.5" }: { className?: string }) {
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
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5v-13Z" />
    </svg>
  );
}

function IconFile({ className = "h-3.5 w-3.5" }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function IconLock({ className = "h-3.5 w-3.5" }: { className?: string }) {
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
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

const ITEM_ICONS: Record<string, ReactNode> = {
  "Libro Associati": <IconBook />,
  Ricevute: <IconFile />,
  Verbali: <IconFile />,
  "Libro Cespiti": <IconBook />,
  Permessi: <IconLock />,
};

export function DocumentiWorkspaceNav({
  showAssociati,
  showRicevute,
  showVerbali,
  showCespiti,
  showPermessi,
}: {
  showAssociati: boolean;
  showRicevute: boolean;
  showVerbali: boolean;
  showCespiti: boolean;
  showPermessi: boolean;
}) {
  const pathname = usePathname();
  const groups = useMemo(
    () =>
      buildDocumentiGroups({
        showAssociati,
        showRicevute,
        showVerbali,
        showCespiti,
        showPermessi,
      }),
    [showAssociati, showRicevute, showVerbali, showCespiti, showPermessi],
  );
  const activeHref = useMemo(
    () => resolveActiveHref(pathname, groups),
    [pathname, groups],
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <AdminWorkspaceNav
      title="Documenti"
      groups={groups}
      activeHref={activeHref}
      segmentAriaLabel="Sezioni documenti"
      itemIcons={ITEM_ICONS}
    />
  );
}
