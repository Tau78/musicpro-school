import Link from "next/link";

import { memberInitials } from "@/lib/ui/associate-theme";

type MemberProfileHeroProps = {
  firstName: string;
  lastName: string;
  memberNumber: number | string | null;
  email: string | null;
  phone: string | null;
  bandName: string | null;
  roomCreditsHours: number | null;
};

export function MemberProfileHero({
  firstName,
  lastName,
  memberNumber,
  email,
  phone,
  bandName,
  roomCreditsHours,
}: MemberProfileHeroProps) {
  const fullName = `${firstName} ${lastName}`.trim();

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-lg font-semibold text-[var(--brand)]">
          {memberInitials(firstName, lastName)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-[var(--brand)]">
            {fullName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {memberNumber ? (
              <span className="rounded-full bg-[var(--brand-accent)]/20 px-3 py-0.5 text-xs font-semibold text-[var(--brand)]">
                N. {memberNumber}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-medium text-emerald-800">
              Quota ok
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="glass-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Contatti
          </p>
          <p className="mt-2 text-sm text-neutral-800">{email ?? "—"}</p>
          {phone ? (
            <p className="mt-1 text-sm text-neutral-600">{phone}</p>
          ) : null}
        </div>

        {bandName ? (
          <div className="glass-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Band
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--brand)]">
              {bandName}
            </p>
          </div>
        ) : null}

        {roomCreditsHours != null ? (
          <div className="glass-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Crediti
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--brand-accent)]">
              {roomCreditsHours} {roomCreditsHours === 1 ? "ora" : "ore"} sala
            </p>
          </div>
        ) : null}
      </div>

      <Link
        href="#dati-personali"
        className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--brand-accent)] px-5 py-3 text-sm font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-accent)]/90"
      >
        Modifica dati
      </Link>
    </div>
  );
}
