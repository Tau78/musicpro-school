"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminNavProps {
  showRubrica: boolean;
  showRimborsi: boolean;
}

const navItems = [
  { href: "/admin/associati", label: "Rubrica", key: "rubrica" as const },
  { href: "/admin/rimborsi", label: "Rimborsi", key: "rimborsi" as const },
];

export function AdminNav({ showRubrica, showRimborsi }: AdminNavProps) {
  const pathname = usePathname();

  const visibleItems = navItems.filter((item) => {
    if (item.key === "rubrica") return showRubrica;
    if (item.key === "rimborsi") return showRimborsi;
    return false;
  });

  return (
    <>
      <nav className="hidden border-b border-white/10 md:block">
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
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
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center py-3 text-xs font-medium ${
                  active
                    ? "text-[var(--brand)]"
                    : "text-neutral-500"
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
            <span>Home</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
