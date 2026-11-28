import type { ReactNode } from "react";
import { Suspense } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { UiRoleSwitchSlot } from "@/components/dashboard/ui-role-switch-slot";

type AssociatePageShellProps = {
  children: ReactNode;
  /** Header actions (gear, sign out, …) */
  actions?: ReactNode;
  /** Hide logo row (e.g. when SiteHeader is used below) */
  hideBrand?: boolean;
};

export function AssociatePageShell({
  children,
  actions,
  hideBrand = false,
}: AssociatePageShellProps) {
  return (
    <main className="associate-gradient-page min-h-screen min-w-0 max-w-full overflow-x-clip">
      {!hideBrand ? (
        <header className="associate-glass-header">
          <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:gap-3 sm:px-6">
            <BrandLogo size="sm" href="/dashboard" />
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Suspense fallback={null}>
                <UiRoleSwitchSlot tone="onLight" when="associato" />
              </Suspense>
              {actions ? (
                <div className="flex min-w-0 items-center gap-2">{actions}</div>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}
      <div className="relative mx-auto min-w-0 max-w-3xl px-4 pb-12 pt-2 sm:px-6 sm:pb-16">
        {children}
      </div>
    </main>
  );
}
