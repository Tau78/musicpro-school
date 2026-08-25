"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";

export type AdminNavItem = {
  href: string;
  label: string;
  active: boolean;
  description?: string;
};

export type AdminNavGroup = {
  label: string;
  items: readonly AdminNavItem[];
};

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      prefetch
      scroll={false}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        if (!active) onNavigate();
      }}
      className={`group block rounded-lg px-3 py-2 touch-manipulation transition-colors ${
        active
          ? "bg-[var(--brand)]/8 text-[var(--brand)] ring-1 ring-[var(--brand)]/15"
          : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      <span
        className={`block text-sm font-medium ${
          active ? "text-[var(--brand)]" : "text-neutral-900"
        }`}
      >
        {item.label}
      </span>
      {item.description ? (
        <span
          className={`mt-0.5 block text-xs leading-snug ${
            active ? "text-[var(--brand)]/70" : "text-neutral-500"
          }`}
        >
          {item.description}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminGroupedNav({
  groups,
  label,
  title,
}: {
  groups: readonly AdminNavGroup[];
  label: string;
  title?: string;
}) {
  const [, startTransition] = useTransition();
  const activeHref =
    groups
      .flatMap((group) => group.items)
      .filter((item) => item.active)
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const [optimisticHref, setOptimisticHref] = useOptimistic(activeHref);

  return (
    <nav
      className="md:w-56 md:shrink-0"
      aria-label={label}
    >
      {title ? (
        <p className="mb-4 hidden px-3 text-base font-semibold text-neutral-900 md:block">
          {title}
        </p>
      ) : null}
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = optimisticHref
                  ? item.href === optimisticHref
                  : item.active;
                return (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      active={active}
                      onNavigate={() =>
                        startTransition(() => setOptimisticHref(item.href))
                      }
                    />
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
