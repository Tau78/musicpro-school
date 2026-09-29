"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useOptimistic, useTransition } from "react";

import { AdminNavMoreButton } from "@/components/admin/admin-nav-more";
import { isSettingsPath } from "@/lib/admin/settings-nav";

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
  | "lezioni"
  | "prenotazioni"
  | "documenti"
  | "rimborsi"
  | "impostazioni"
  | "website";

const NAV_DEFS: {
  key: NavKey;
  label: string;
  href: string;
  mobilePrimary?: boolean;
}[] = [
  { key: "home", label: "Home", href: "/dashboard", mobilePrimary: true },
  {
    key: "prenotazioni",
    label: "Prenotazioni",
    href: "/admin/prenotazioni",
    mobilePrimary: true,
  },
  {
    key: "lezioni",
    label: "Lezioni",
    href: "/admin/lezioni/calendario",
    mobilePrimary: true,
  },
  {
    key: "rubrica",
    label: "Rubrica",
    href: "/admin/associati",
    mobilePrimary: true,
  },
  { key: "documenti", label: "Documenti", href: "/admin/documenti" },
  { key: "rimborsi", label: "Rimborsi", href: "/admin/rimborsi" },
  { key: "impostazioni", label: "Impostazioni", href: "/admin/impostazioni" },
  { key: "website", label: "Sito", href: "/admin/website" },
];

export function AdminNav({
  showRubrica,
  showLezioni,
  showPrenotazioni,
  showDocumenti,
  showRimborsi,
  showImpostazioni,
  showWebsite,
  documentiHref,
  settingsHref,
}: AdminNavProps) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);

  const visibleItems = useMemo(() => {
    return NAV_DEFS.filter((item) => {
      if (item.key === "home") return true;
      if (item.key === "rubrica") return showRubrica;
      if (item.key === "lezioni") return showLezioni;
      if (item.key === "prenotazioni") return showPrenotazioni;
      if (item.key === "documenti") return showDocumenti;
      if (item.key === "rimborsi") return showRimborsi;
      if (item.key === "impostazioni") return showImpostazioni;
      if (item.key === "website") return showWebsite;
      return false;
    }).map((item) => {
      if (item.key === "impostazioni") return { ...item, href: settingsHref };
      if (item.key === "documenti") return { ...item, href: documentiHref };
      return item;
    });
  }, [
    documentiHref,
    settingsHref,
    showDocumenti,
    showImpostazioni,
    showLezioni,
    showPrenotazioni,
    showRimborsi,
    showRubrica,
    showWebsite,
  ]);

  const fixedPrimaryKeys = new Set<NavKey>([
    "home",
    ...(showPrenotazioni ? (["prenotazioni"] as const) : []),
    ...(showLezioni ? (["lezioni"] as const) : []),
    ...(showRubrica ? (["rubrica"] as const) : []),
  ]);

  const mobileBarItems = visibleItems.filter((item) =>
    fixedPrimaryKeys.has(item.key),
  );

  const mobileMoreItems = visibleItems
    .filter((item) => !fixedPrimaryKeys.has(item.key))
    .map((item) => ({
      key: item.key,
      href: item.href,
      label: item.label,
      active: isNavItemActive(item.key, item.href, optimisticPath),
    }));

  const anyMoreActive = mobileMoreItems.some((item) => item.active);

  function navLinkClass(active: boolean, compact = false) {
    if (compact) {
      return `flex flex-1 flex-col items-center py-2.5 text-[11px] font-medium touch-manipulation ${
        active ? "text-[var(--brand)]" : "text-neutral-500"
      }`;
    }
    return `touch-manipulation border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
      active
        ? "border-[var(--brand-accent)] text-white"
        : "border-transparent text-white/70 hover:text-white"
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex">
          {mobileBarItems.map((item) => {
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
                className={navLinkClass(active, true)}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
          <AdminNavMoreButton items={mobileMoreItems} anyActive={anyMoreActive} />
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
  if (key === "impostazioni") return isSettingsPath(pathname);
  if (key === "documenti") return pathname.startsWith("/admin/documenti");
  if (key === "website") return pathname.startsWith("/admin/website");
  if (key === "lezioni") return pathname.startsWith("/admin/lezioni");
  return pathname.startsWith(href);
}
