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

function SideNavList({
  items,
  optimisticHref,
  onNavigate,
}: {
  items: readonly AdminSideNavItem[];
  optimisticHref: string | null;
  onNavigate: (href: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5 md:flex-col md:flex-nowrap">
      {items.map((item) => {
        const active = optimisticHref ? item.href === optimisticHref : item.active;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch
              scroll={false}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (!active) {
                  onNavigate(item.href);
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
  );
}

export function AdminFlatNav({
  items,
  label,
}: {
  items: readonly AdminSideNavItem[];
  label: string;
}) {
  const [, startTransition] = useTransition();
  const activeHref = items.find((item) => item.active)?.href ?? null;
  const [optimisticHref, setOptimisticHref] = useOptimistic(activeHref);

  return (
    <nav className="md:w-36 md:shrink-0" aria-label={label}>
      <SideNavList
        items={items}
        optimisticHref={optimisticHref}
        onNavigate={(href) => startTransition(() => setOptimisticHref(href))}
      />
    </nav>
  );
}

export function AdminSideNav({
  groups,
  label,
}: {
  groups: readonly AdminSideNavGroup[];
  label: string;
}) {
  const items = groups.flatMap((group) => group.items);
  return <AdminFlatNav items={items} label={label} />;
}
