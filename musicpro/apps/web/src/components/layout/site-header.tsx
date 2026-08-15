import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";

type NavLink = {
  href: string;
  label: string;
};

type SiteHeaderProps = {
  eyebrow?: string;
  title?: string;
  navLinks?: NavLink[];
  actions?: ReactNode;
};

export function SiteHeader({
  eyebrow,
  title,
  navLinks = [],
  actions,
}: SiteHeaderProps) {
  return (
    <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <BrandLogo size="sm" />
          {title ? (
            <div className="hidden border-l border-neutral-200 pl-6 sm:block">
              {eyebrow ? (
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-accent)]">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="text-lg font-semibold text-[var(--brand)]">{title}</h1>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {navLinks.length > 0 ? (
            <nav className="flex flex-wrap items-center gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-[var(--brand)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {actions}
        </div>
      </div>
      {title ? (
        <div className="border-t border-neutral-100 px-6 py-3 sm:hidden">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-accent)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-lg font-semibold text-[var(--brand)]">{title}</h1>
        </div>
      ) : null}
    </header>
  );
}
