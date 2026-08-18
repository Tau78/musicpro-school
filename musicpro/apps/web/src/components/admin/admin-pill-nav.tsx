"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";

export interface AdminPillNavItem {
  href: string;
  label: string;
  active: boolean;
}

export function AdminPillNav({
  items,
  nested = false,
}: {
  items: AdminPillNavItem[];
  nested?: boolean;
}) {
  const [, startTransition] = useTransition();
  const activeHref = items.find((item) => item.active)?.href ?? null;
  const [optimisticHref, setOptimisticHref] = useOptimistic(activeHref);

  return (
    <nav
      className={`mb-3 flex flex-wrap gap-2 text-sm ${
        nested
          ? "border-b border-neutral-100 pb-2"
          : "border-b border-neutral-200 pb-3"
      }`}
    >
      {items.map((item) => {
        const active = optimisticHref
          ? item.href === optimisticHref
          : item.active;
        const className = nested
          ? active
            ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white"
            : "rounded-md px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          : active
            ? "rounded-lg bg-[var(--brand)] px-3 py-1.5 font-medium text-white"
            : "rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900";

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            scroll={false}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!active) {
                startTransition(() => setOptimisticHref(item.href));
              }
            }}
            className={`touch-manipulation ${className}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
