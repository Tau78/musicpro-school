"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type LessonsNavGroup = {
  label: string;
  items: readonly { href: string; label: string }[];
};

function resolveActiveHref(
  pathname: string,
  groups: readonly LessonsNavGroup[],
): string | null {
  return (
    groups
      .flatMap((group) => group.items)
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
}

function tabClass(active: boolean): string {
  return `inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium touch-manipulation transition-colors ${
    active
      ? "bg-[var(--brand)] text-white shadow-sm"
      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
  }`;
}

export function LessonsWorkspaceNav({
  groups,
  title = "Lezioni",
}: {
  groups: readonly LessonsNavGroup[];
  title?: string;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, groups);

  return (
    <header className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-[var(--brand)] sm:text-lg">
          {title}
        </h2>
      </div>
      <nav
        className="divide-y divide-neutral-100 md:divide-y-0"
        aria-label="Sezioni lezioni"
      >
        {groups.map((group) => (
          <div
            key={group.label}
            className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4 md:py-2"
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 sm:w-14">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={tabClass(active)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </header>
  );
}
