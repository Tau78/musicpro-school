"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";

export type AdminWorkspaceNavGroup = {
  label: string;
  items: readonly { href: string; label: string }[];
};

function hrefMatchesItem(path: string, itemHref: string): boolean {
  const itemPath = itemHref.split("?")[0] ?? itemHref;
  return path === itemPath || path.startsWith(`${itemPath}/`);
}

function groupForHref(
  href: string | null,
  groups: readonly AdminWorkspaceNavGroup[],
): string {
  if (!href) return groups[0]?.label ?? "";
  const pathOnly = href.split("?")[0] ?? href;
  return (
    groups.find((group) =>
      group.items.some((item) => hrefMatchesItem(pathOnly, item.href)),
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
  return `shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold touch-manipulation transition-colors ${
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
  /** Solo accessibilità (tab principale già visibile nella nav admin). */
  title?: string;
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

  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticHref, setOptimisticHref] = useOptimistic(activeHref);

  const segmentsLabel =
    segmentAriaLabel ?? (title ? `Sezioni ${title}` : "Sezioni workspace");

  return (
    <header className="rounded-xl bg-white/90 shadow-sm ring-1 ring-black/5">
      <div className="pt-2 pb-1.5">
        <div
          className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-neutral-100/90 p-0.5"
          role="tablist"
          aria-label={segmentsLabel}
        >
          {groups.map((group) => {
            const active = group.label === activeGroup?.label;
            const firstItem = group.items[0];
            return (
              <button
                key={group.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (!firstItem) return;
                  setSelectedGroup(group.label);
                  startTransition(() => {
                    setOptimisticHref(firstItem.href);
                  });
                  router.push(firstItem.href);
                }}
                onPointerEnter={() => {
                  if (firstItem) router.prefetch(firstItem.href);
                }}
                className={segmentClass(active)}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      <nav
        className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={activeGroup ? `Azioni ${activeGroup.label}` : "Azioni"}
      >
        {(activeGroup?.items ?? []).map((item) => {
          const active = item.href === optimisticHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              scroll={false}
              aria-current={active ? "page" : undefined}
              onPointerEnter={() => router.prefetch(item.href)}
              onClick={() => {
                startTransition(() => {
                  setOptimisticHref(item.href);
                });
              }}
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
