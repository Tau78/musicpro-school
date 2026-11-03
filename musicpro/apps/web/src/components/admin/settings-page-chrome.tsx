"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const pillStripClass =
  "flex gap-1 overflow-x-auto rounded-lg bg-neutral-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function pillTabClass(active: boolean): string {
  return `shrink-0 rounded-md px-3 py-1.5 text-sm font-medium touch-manipulation ${
    active
      ? "bg-white text-[var(--brand)] shadow-sm"
      : "text-neutral-600"
  }`;
}

export function SettingsPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-[var(--brand)] sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function SettingsSectionTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className={pillStripClass} role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={pillTabClass(selected)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsLinkTabs({
  tabs,
}: {
  tabs: { href: string; label: string; active: boolean }[];
}) {
  return (
    <div className={pillStripClass} role="tablist">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          prefetch
          scroll={false}
          role="tab"
          aria-selected={tab.active}
          className={pillTabClass(tab.active)}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function SettingsStickySaveBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-16 z-10 -mx-4 mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:bottom-0 sm:mx-0">
      {children}
    </div>
  );
}

export function SettingsPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export const settingsPrimaryButtonClass =
  "btn-brand rounded-lg bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60";

export const settingsSecondaryButtonClass =
  "rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
