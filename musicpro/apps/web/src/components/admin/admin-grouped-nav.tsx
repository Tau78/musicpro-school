"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";

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
  compact = false,
}: {
  item: AdminNavItem;
  active: boolean;
  onNavigate: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={item.href}
        prefetch
        scroll={false}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (!active) onNavigate();
        }}
        className={`inline-flex shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium touch-manipulation ${
          active
            ? "bg-[var(--brand)] text-white"
            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
        }`}
      >
        {item.label}
      </Link>
    );
  }

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

function resolveActiveGroupLabel(groups: readonly AdminNavGroup[]): string {
  const activeItem = groups
    .flatMap((group) => group.items.map((item) => ({ group, item })))
    .filter(({ item }) => item.active)
    .sort((a, b) => b.item.href.length - a.item.href.length)[0];

  return activeItem?.group.label ?? groups[0]?.label ?? "";
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

  const activeGroupLabel = useMemo(
    () => resolveActiveGroupLabel(groups),
    [groups],
  );
  const [mobileGroup, setMobileGroup] = useState(activeGroupLabel);

  useEffect(() => {
    setMobileGroup(activeGroupLabel);
  }, [activeGroupLabel]);

  const mobileItems =
    groups.find((group) => group.label === mobileGroup)?.items ?? [];

  return (
    <nav className="md:w-56 md:shrink-0" aria-label={label}>
      <div className="space-y-2 max-md:block md:hidden">
        <div
          className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={`Sezioni ${label}`}
        >
          {groups.map((group) => {
            const selected = group.label === mobileGroup;
            return (
              <button
                key={group.label}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMobileGroup(group.label)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold touch-manipulation ${
                  selected
                    ? "bg-[var(--brand)] text-white"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={`Voci ${mobileGroup}`}
        >
          {mobileItems.map((item) => {
            const active = optimisticHref
              ? item.href === optimisticHref
              : item.active;
            return (
              <NavLink
                key={item.href}
                item={item}
                active={active}
                compact
                onNavigate={() =>
                  startTransition(() => setOptimisticHref(item.href))
                }
              />
            );
          })}
        </div>
      </div>

      <div className="hidden md:block">
        {title ? (
          <p className="mb-4 px-3 text-base font-semibold text-neutral-900">
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
      </div>
    </nav>
  );
}
