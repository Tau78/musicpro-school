import Link from "next/link";

export type NextActionBannerProps = {
  title: string;
  description?: string;
  href: string;
  ctaLabel: string;
};

/** Banner “prossima azione” (anagrafica, quota, …) — una riga densa. */
export function NextActionBanner({
  title,
  description,
  href,
  ctaLabel,
}: NextActionBannerProps) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 font-medium">
          {title}
          {description ? (
            <span className="mt-0.5 block text-xs font-normal text-amber-800/90">
              {description}
            </span>
          ) : null}
        </p>
        <Link
          href={href}
          className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand)]/90"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
