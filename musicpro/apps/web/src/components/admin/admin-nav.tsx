"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useOptimistic, useTransition, type ReactNode } from "react";

import {
  NavIconCalendar,
  NavIconDocumenti,
  NavIconHome,
  NavIconRimborsi,
  NavIconRubrica,
  NavIconStats,
} from "@/components/admin/admin-nav-icons";
interface AdminNavProps {
  showRubrica: boolean;
  showLezioni: boolean;
  showPrenotazioni: boolean;
  showDocumenti: boolean;
  showRimborsi: boolean;
  showImpostazioni: boolean;
  showWebsite: boolean;
  documentiHref: string;
  settingsHref: string;
}

type NavKey =
  | "home"
  | "rubrica"
  | "stats"
  | "prenotazioni"
  | "documenti"
  | "rimborsi";

type NavDef = {
  key: NavKey;
  label: string;
  mobileLabel: string;
  href: string;
  mobileHref?: string;
  mobileIcon: ReactNode;
};

const NAV_DEFS: NavDef[] = [
  {
    key: "home",
    label: "Home",
    mobileLabel: "Casa",
    href: "/dashboard",
    mobileIcon: <NavIconHome />,
  },
  {
    key: "prenotazioni",
    label: "Prenotazioni",
    mobileLabel: "Calendario",
    href: "/admin/prenotazioni",
    mobileHref: "/admin/prenotazioni/calendario",
    mobileIcon: <NavIconCalendar />,
  },
  {
    key: "stats",
    label: "Stats",
    mobileLabel: "Stats",
    href: "/admin/stats",
    mobileIcon: <NavIconStats />,
  },
  {
    key: "rubrica",
    label: "Rubrica",
    mobileLabel: "Rubrica",
    href: "/admin/associati",
    mobileIcon: <NavIconRubrica />,
  },
  {
    key: "documenti",
    label: "Documenti",
    mobileLabel: "Documenti",
    href: "/admin/documenti",
    mobileIcon: <NavIconDocumenti />,
  },
  {
    key: "rimborsi",
    label: "Rimborsi",
    mobileLabel: "Rimborsi",
    href: "/admin/rimborsi",
    mobileIcon: <NavIconRimborsi />,
  },
];

export function AdminNav({
  showRubrica,
  showPrenotazioni,
  showDocumenti,
  showRimborsi,
  documentiHref,
}: AdminNavProps) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);

  const visibleItems = useMemo(() => {
    return NAV_DEFS.filter((item) => {
      if (item.key === "home") return true;
      if (item.key === "rubrica") return showRubrica;
      // Stats al posto di Note: serve gestione prenotazioni (sale / incassi).
      if (item.key === "stats") return showPrenotazioni;
      if (item.key === "prenotazioni") return showPrenotazioni;
      if (item.key === "documenti") return showDocumenti;
      if (item.key === "rimborsi") return showRimborsi;
      return false;
    }).map((item) => {
      if (item.key === "documenti") return { ...item, href: documentiHref };
      return item;
    });
  }, [
    documentiHref,
    showDocumenti,
    showPrenotazioni,
    showRimborsi,
    showRubrica,
  ]);

  function navLinkClass(active: boolean) {
    return `touch-manipulation border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
      active
        ? "border-[var(--brand-accent)] text-white"
        : "border-transparent text-white/70 hover:text-white"
    }`;
  }

  function mobileLinkClass(active: boolean) {
    return `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 touch-manipulation ${
      active ? "text-[var(--brand)]" : "text-neutral-500"
    }`;
  }

  return (
    <>
      <nav className="hidden border-b border-white/10 md:block">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleItems.map((item) => {
            const active = isNavItemActive(
              item.key,
              item.href,
              optimisticPath,
            );
            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch
                onClick={() => {
                  startTransition(() => setOptimisticPath(item.href));
                }}
                className={`shrink-0 whitespace-nowrap ${navLinkClass(active)}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white md:hidden"
        aria-label="Navigazione principale"
      >
        <div className="flex pb-[max(0.625rem,env(safe-area-inset-bottom,0.625rem))] pt-1">
          {visibleItems.map((item) => {
            const href = item.mobileHref ?? item.href;
            const active = isNavItemActive(item.key, item.href, optimisticPath);
            return (
              <Link
                key={item.key}
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                aria-label={item.mobileLabel}
                title={item.mobileLabel}
                onClick={() => {
                  startTransition(() => setOptimisticPath(href));
                }}
                className={mobileLinkClass(active)}
              >
                {item.mobileIcon}
                <span className="max-w-full truncate text-[9px] font-medium leading-none">
                  {item.mobileLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function isNavItemActive(
  key: NavKey,
  href: string,
  pathname: string,
): boolean {
  if (key === "home") {
    return (
      pathname === "/dashboard" ||
      (pathname.startsWith("/dashboard/") &&
        !pathname.startsWith("/dashboard/impostazioni"))
    );
  }
  if (key === "documenti") return pathname.startsWith("/admin/documenti");
  if (key === "stats") return pathname.startsWith("/admin/stats");
  if (key === "prenotazioni") return pathname.startsWith("/admin/prenotazioni");
  return pathname.startsWith(href);
}
