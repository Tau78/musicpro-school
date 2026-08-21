"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";

export type AdminSideNavItem = {
  href: string;
  label: string;
  active: boolean;
};

export type AdminSideNavGroup = {
  label: string;
  items: readonly AdminSideNavItem[];
};

export function AdminSideNav({
  groups,
  label,
}: {
  groups: readonly AdminSideNavGroup[];
  label: string;
}) {
  const [, startTransition] = useTransition();
  const activeHref = groups.flatMap((group) => group.items).find((item) => item.active)
    ?.href ?? null;
  const [optimisticHref, setOptimisticHref] = useOptimistic(activeHref);

  return (
    <nav className="md:w-36 md:shrink-0" aria-label={label}>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              {group.label}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5 md:flex-col md:flex-nowrap">
              {group.items.map((item) => {
                const active = optimisticHref
                  ? item.href === optimisticHref
                  : item.active;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        if (!active) {
                          startTransition(() => setOptimisticHref(item.href));
                        }
                      }}
                      className={`block rounded-lg px-3 py-1.5 text-sm font-medium touch-manipulation ${
                        active
                          ? "bg-[var(--brand)] text-white"
                          : "text-neutral-600 hover:bg-neutral-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
