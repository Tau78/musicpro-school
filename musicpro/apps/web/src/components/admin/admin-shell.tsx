import Link from "next/link";

import { APP_NAME, type MemberRoleValue } from "@musicpro/shared";

import { AdminNav } from "@/components/admin/admin-nav";
import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { HeaderIdentity } from "@/components/dashboard/header-user-chip";
import { BlurActiveOnNavigate } from "@/components/navigation/blur-active-on-navigate";
import type { AdminShellNavConfig } from "@/lib/admin/shell-config";

export function AdminShell({
  nav,
  title = "Amministrazione",
  children,
  wide = false,
  userRoles,
}: {
  nav: AdminShellNavConfig;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
  userRoles?: MemberRoleValue[];
}) {
  return (
    <div className="min-h-screen min-w-0 max-w-full overflow-x-clip bg-[var(--background)] pb-[calc(4.25rem+max(0.625rem,env(safe-area-inset-bottom,0.625rem)))] md:pb-0">
      <BlurActiveOnNavigate />
      <header className="border-b border-white/10 bg-[var(--brand)] text-white">
        <div className="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-2 px-4 py-1.5 sm:gap-3 sm:px-6">
          <div className="min-w-0 flex-1 md:max-w-[26rem] md:flex-none">
            <HeaderIdentity
              eyebrow={APP_NAME}
              title={title}
              roles={userRoles}
            />
          </div>
          <AdminNav {...nav} placement="inline" />
          <div className="shrink-0">
            <HeaderSettingsActions variant="onBrand" />
          </div>
        </div>
      </header>

      <main
        className={`mx-auto min-w-0 px-4 py-4 sm:px-6 sm:py-6 ${
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
