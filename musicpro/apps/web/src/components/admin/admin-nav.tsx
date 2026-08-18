"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { isSettingsPath } from "@/lib/admin/settings-nav";

interface AdminNavProps {
  showRubrica: boolean;
  showLezioni: boolean;
  showPrenotazioni: boolean;
  showRimborsi: boolean;
  showImpostazioni: boolean;
  settingsHref: string;
}

const navItems = [
  { href: "/admin/associati", label: "Rubrica", key: "rubrica" as const },
  { href: "/admin/lezioni/calendario", label: "Lezioni", key: "lezioni" as const },
  {
    href: "/admin/prenotazioni",
    label: "Prenotazioni",
    key: "prenotazioni" as const,
  },
  { href: "/admin/rimborsi", label: "Rimborsi", key: "rimborsi" as const },
  {
    href: "/admin/impostazioni",
    label: "Impostazioni",
    key: "impostazioni" as const,
  },
];

export function AdminNav({
  showRubrica,
  showLezioni,
  showPrenotazioni,
  showRimborsi,
  showImpostazioni,
  settingsHref,
}: AdminNavProps) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);

  const visibleItems = navItems
    .filter((item) => {
      if (item.key === "rubrica") return showRubrica;
      if (item.key === "lezioni") return showLezioni;
      if (item.key === "prenotazioni") return showPrenotazioni;
      if (item.key === "rimborsi") return showRimborsi;
      if (item.key === "impostazioni") return showImpostazioni;
      return false;
    })
    .map((item) =>
      item.key === "impostazioni" ? { ...item, href: settingsHref } : item,
    );

  return (
    <>
      <nav className="hidden border-b border-white/10 md:block">
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
          {visibleItems.map((item) => {
            const active = isNavItemActive(item.key, item.href, optimisticPath);
            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch
                onClick={() => {
                  startTransition(() => setOptimisticPath(item.href));
                }}
                className={`touch-manipulation border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-[var(--brand-accent)] text-white"
                    : "border-transparent text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white md:hidden">
        <div className="flex">
          {visibleItems.map((item) => {
            const active = isNavItemActive(item.key, item.href, optimisticPath);
            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch
                onClick={() => {
                  startTransition(() => setOptimisticPath(item.href));
                }}
                className={`flex flex-1 flex-col items-center py-3 text-xs font-medium touch-manipulation ${
                  active ? "text-[var(--brand)]" : "text-neutral-500"
                }`}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className="flex flex-1 flex-col items-center py-3 text-xs font-medium text-neutral-500"
          >
            <span>Dashboard</span>
          </Link>
        </div>
      </nav>
    </>
  );
}

function isNavItemActive(
  key: (typeof navItems)[number]["key"],
  href: string,
  pathname: string,
): boolean {
  if (key === "impostazioni") return isSettingsPath(pathname);
  if (key === "lezioni") return pathname.startsWith("/admin/lezioni");
  return pathname.startsWith(href);
}
