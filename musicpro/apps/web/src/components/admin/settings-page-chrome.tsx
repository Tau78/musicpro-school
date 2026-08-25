"use client";

import Link from "next/link";
import type { ReactNode } from "react";

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
    <div className="mb-6 flex flex-col gap-3 border-b border-neutral-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">
            {description}
          </p>
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
    <div
      className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1"
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? "bg-white text-[var(--brand)] shadow-sm ring-1 ring-neutral-200/80"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
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
    <div
      className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1"
      role="tablist"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          prefetch
          scroll={false}
          role="tab"
          aria-selected={tab.active}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab.active
              ? "bg-white text-[var(--brand)] shadow-sm ring-1 ring-neutral-200/80"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {tab.label}
        </Link>
      ))}
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
