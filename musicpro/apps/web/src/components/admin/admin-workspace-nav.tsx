"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminWorkspaceNavGroup = {
  label: string;
  items: readonly { href: string; label: string }[];
};

function groupForHref(
  href: string | null,
  groups: readonly AdminWorkspaceNavGroup[],
): string {
  if (!href) return groups[0]?.label ?? "";
  const pathOnly = href.split("?")[0] ?? href;
  return (
    groups.find((group) =>
      group.items.some(
        (item) => item.href === href || item.href.split("?")[0] === pathOnly,
      ),
    )?.label ??
    groups[0]?.label ??
    ""
  );
}

function actionClass(active: boolean): string {
  return `inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium touch-manipulation transition-colors ${
    active
      ? "bg-[var(--brand)] text-white shadow-sm"
      : "bg-neutral-100/80 text-neutral-700 hover:bg-neutral-200"
  }`;
}

function segmentClass(active: boolean): string {
  return `flex-1 rounded-md px-2 py-1.5 text-center text-xs font-semibold touch-manipulation transition-colors ${
    active
      ? "bg-white text-[var(--brand)] shadow-sm"
      : "text-neutral-500 hover:text-neutral-800"
  }`;
}

export function AdminWorkspaceNav({
  groups,
  title,
  activeHref,
  segmentAriaLabel,
  itemIcons,
}: {
  groups: readonly AdminWorkspaceNavGroup[];
  title: string;
  activeHref: string | null;
  segmentAriaLabel?: string;
  itemIcons?: Record<string, ReactNode>;
}) {
  const pathGroup = useMemo(
    () => groupForHref(activeHref, groups),
    [activeHref, groups],
  );
  const [selectedGroup, setSelectedGroup] = useState(pathGroup);

  useEffect(() => {
    setSelectedGroup(pathGroup);
  }, [pathGroup]);

  const activeGroup =
    groups.find((group) => group.label === selectedGroup) ?? groups[0];

  return (
    <header className="rounded-xl bg-white/90 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          {title}
        </h2>
        <div
          className="flex min-w-0 flex-1 rounded-lg bg-neutral-100/90 p-0.5"
          role="tablist"
          aria-label={segmentAriaLabel ?? `Sezioni ${title}`}
        >
          {groups.map((group) => {
            const active = group.label === activeGroup?.label;
            return (
              <button
                key={group.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedGroup(group.label)}
                className={segmentClass(active)}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      <nav
        className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={activeGroup ? `Azioni ${activeGroup.label}` : "Azioni"}
      >
        {(activeGroup?.items ?? []).map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={actionClass(active)}
            >
              {itemIcons?.[item.label] ?? null}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
