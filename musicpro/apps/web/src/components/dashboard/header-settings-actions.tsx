import type { MemberRoleValue } from "@musicpro/shared";

import { AppInfoButton } from "@/components/dashboard/app-info-button";
import { HeaderUserChip } from "@/components/dashboard/header-user-chip";
import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";

const onBrandIconClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white";

/** Utente (+ privilegi) · impostazioni · info (ordine: chip, ingranaggio, info). */
export function HeaderSettingsActions({
  settingsHref,
  settingsLabel,
  variant = "default",
  settingsClassName,
  infoClassName,
  userFirstName,
  userRoles,
}: {
  settingsHref?: string;
  settingsLabel?: string;
  variant?: "default" | "onBrand";
  settingsClassName?: string;
  infoClassName?: string;
  userFirstName?: string | null;
  userRoles?: MemberRoleValue[];
}) {
  const gearClass =
    settingsClassName ??
    (variant === "onBrand"
      ? onBrandIconClass
      : undefined);
  const info =
    infoClassName ??
    (variant === "onBrand" ? onBrandIconClass : undefined);
  const showUser =
    Boolean(userFirstName?.trim()) || (userRoles != null && userRoles.length > 0);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {showUser ? (
        <HeaderUserChip
          firstName={userFirstName?.trim() || "Utente"}
          roles={userRoles ?? []}
          variant={variant}
        />
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5">
        <SettingsGearLink
          href={settingsHref}
          label={settingsLabel}
          className={gearClass}
        />
        <AppInfoButton className={info} />
      </div>
    </div>
  );
}
