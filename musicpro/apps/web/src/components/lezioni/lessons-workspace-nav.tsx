"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
      .filter(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
}

function groupForHref(
  href: string | null,
  groups: readonly LessonsNavGroup[],
): string {
  if (!href) return groups[0]?.label ?? "";
  return (
    groups.find((group) => group.items.some((item) => item.href === href))
      ?.label ??
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

function IconSun({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconCalendar({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function IconBook({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5v-13Z" />
    </svg>
  );
}

function IconInbox({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 13h-6l-2 3H10l-2-3H2" />
      <path d="M5.45 5.11 2 13v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-7.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function IconEuro({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 10h12M4 14h10" />
      <path d="M19 6.5A8 8 0 1 0 19 17.5" />
    </svg>
  );
}

function IconReceipt({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function IconClock({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconBoard({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}

function IconSchool({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m3 10 9-5 9 5-9 5-9-5Z" />
      <path d="M7 12.5v4.2c0 .7 2.2 2.3 5 2.3s5-1.6 5-2.3v-4.2" />
    </svg>
  );
}

function IconHome({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

const ITEM_ICONS: Record<string, ReactNode> = {
  Oggi: <IconSun />,
  Home: <IconHome />,
  Calendario: <IconCalendar />,
  Corsi: <IconBook />,
  "Da fare": <IconInbox />,
  Rette: <IconEuro />,
  Ricevute: <IconReceipt />,
  Notule: <IconReceipt />,
  Orari: <IconClock />,
  Tabelloni: <IconBoard />,
  Scuola: <IconSchool />,
};

export function LessonsWorkspaceNav({
  groups,
  title = "Lezioni",
}: {
  groups: readonly LessonsNavGroup[];
  title?: string;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, groups);
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
          aria-label="Sezioni lezioni"
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
              {ITEM_ICONS[item.label] ?? null}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
