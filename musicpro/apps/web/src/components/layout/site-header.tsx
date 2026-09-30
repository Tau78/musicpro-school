import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";

type NavLink = {
  href: string;
  label: string;
  mobileLabel?: string;
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
    <header className="associate-glass-header">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-6">
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

        <div className="flex shrink-0 items-center gap-3">
          {navLinks.length > 0 ? (
            <nav className="hidden items-center gap-2 sm:flex">
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
        <div className="border-t border-neutral-100 px-4 py-3 sm:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-accent)]">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="truncate text-lg font-semibold text-[var(--brand)]">
                {title}
              </h1>
            </div>
            {navLinks.length > 0 ? (
              <nav className="flex shrink-0 items-center gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-[var(--brand)]"
                  >
                    {link.mobileLabel ?? link.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
