import { AppInfoButton } from "@/components/dashboard/app-info-button";
import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";

const onBrandIconClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white";

/** Impostazioni + info app (ordine: ingranaggio, info a destra). */
export function HeaderSettingsActions({
  settingsHref,
  settingsLabel,
  variant = "default",
  settingsClassName,
  infoClassName,
}: {
  settingsHref?: string;
  settingsLabel?: string;
  variant?: "default" | "onBrand";
  settingsClassName?: string;
  infoClassName?: string;
}) {
  const gearClass =
    settingsClassName ??
    (variant === "onBrand"
      ? onBrandIconClass
      : undefined);
  const info =
    infoClassName ??
    (variant === "onBrand" ? onBrandIconClass : undefined);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <SettingsGearLink
        href={settingsHref}
        label={settingsLabel}
        className={gearClass}
      />
      <AppInfoButton className={info} />
    </div>
  );
}
