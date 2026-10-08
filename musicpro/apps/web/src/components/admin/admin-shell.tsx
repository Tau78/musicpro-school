import Link from "next/link";

import { APP_NAME } from "@musicpro/shared";

import { AdminNav } from "@/components/admin/admin-nav";
import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";
import type { AdminShellNavConfig } from "@/lib/admin/shell-config";

export function AdminShell({
  nav,
  title = "Amministrazione",
  children,
  wide = false,
}: {
  nav: AdminShellNavConfig;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] pb-[calc(4.25rem+max(0.625rem,env(safe-area-inset-bottom,0.625rem)))] md:pb-0">
      <header className="bg-[var(--brand)] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 sm:py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          </div>
          <SettingsGearLink className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white" />
        </div>
        <AdminNav {...nav} />
      </header>

      <main
        className={`mx-auto px-4 py-4 sm:px-6 sm:py-6 ${
          wide ? "max-w-7xl" : "max-w-6xl"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

/** Titolo pagina dentro la shell (sotto header globale). */
export function AdminShellPageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-[var(--brand)] sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function AdminShellBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mb-3 inline-block text-sm font-medium text-[var(--brand)] hover:underline"
    >
      ← {label}
    </Link>
  );
}
