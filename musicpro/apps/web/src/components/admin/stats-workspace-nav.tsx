"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  AdminWorkspaceNav,
  type AdminWorkspaceNavGroup,
} from "@/components/admin/admin-workspace-nav";
import { STATS_SUBSECTION_HREFS } from "@/lib/admin/stats-nav";

export type StatsNavGroup = AdminWorkspaceNavGroup;

export const ADMIN_STATS_NAV: readonly StatsNavGroup[] = [
  {
    label: "Incassi",
    items: [{ href: STATS_SUBSECTION_HREFS.panoramica, label: "Panoramica" }],
  },
  {
    label: "Sale",
    items: [{ href: STATS_SUBSECTION_HREFS.utilizzo, label: "Utilizzo" }],
  },
] as const;

function resolveActiveHref(
  pathname: string,
  groups: readonly StatsNavGroup[],
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

const ITEM_ICONS: Record<string, ReactNode> = {
  Panoramica: <IconChart />,
  Utilizzo: <IconCalendar />,
};

export function StatsWorkspaceNav() {
  const pathname = usePathname();
  const activeHref = useMemo(
    () => resolveActiveHref(pathname, ADMIN_STATS_NAV),
    [pathname],
  );

  return (
    <AdminWorkspaceNav
      title="Stats"
      groups={ADMIN_STATS_NAV}
      activeHref={activeHref}
      segmentAriaLabel="Sezioni stats"
      itemIcons={ITEM_ICONS}
    />
  );
}
