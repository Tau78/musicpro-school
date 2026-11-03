import Link from "next/link";

import {
  MEMBER_ROLE_LABELS,
  MemberRole,
  type MemberRoleValue,
} from "@musicpro/shared";

/** Ordine di visualizzazione privilegi (più rilevanti prima). */
const ROLE_ORDER: MemberRoleValue[] = [
  MemberRole.Admin,
  MemberRole.Segreteria,
  MemberRole.Docente,
  MemberRole.Collaboratore,
  MemberRole.Social,
  MemberRole.Tutore,
  MemberRole.Associato,
];

export function formatRoleLabels(roles: MemberRoleValue[]): string {
  const unique = [...new Set(roles)];
  unique.sort(
    (a, b) =>
      (ROLE_ORDER.indexOf(a) === -1 ? 99 : ROLE_ORDER.indexOf(a)) -
      (ROLE_ORDER.indexOf(b) === -1 ? 99 : ROLE_ORDER.indexOf(b)),
  );
  return unique
    .map((role) => MEMBER_ROLE_LABELS[role as MemberRole] ?? role)
    .join(" · ");
}

/** Brand + «Ciao Nome (ruoli)» a sinistra dell’header blu. */
export function HeaderIdentity({
  eyebrow,
  title,
  roles,
  profileHref = "/dashboard/impostazioni",
}: {
  eyebrow: string;
  title: string;
  roles?: MemberRoleValue[];
  /** Profilo associato (anagrafica, band, tutorati). */
  profileHref?: string;
}) {
  const privileges = roles?.length ? formatRoleLabels(roles) : "";
  const full = privileges ? `${title} (${privileges})` : title;

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-[var(--brand-accent)]">
        {eyebrow}
      </p>
      <Link
        href={profileHref}
        className="mt-0.5 block min-w-0 truncate rounded-md text-sm font-semibold leading-tight text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80"
        title={`${full} — profilo personale`}
      >
        {title}
        {privileges ? (
          <span className="font-normal text-white/75"> ({privileges})</span>
        ) : null}
      </Link>
    </div>
  );
}

/** Nome + privilegi a sinistra della rotella (header blu). */
export function HeaderUserChip({
  firstName,
  roles,
  variant = "onBrand",
}: {
  firstName: string;
  roles: MemberRoleValue[];
  variant?: "onBrand" | "default";
}) {
  const name = firstName.trim() || "Utente";
  const privileges = formatRoleLabels(roles);
  const onBrand = variant === "onBrand";

  return (
    <div
      className={`min-w-0 max-w-[9.5rem] text-right sm:max-w-[14rem] ${
        onBrand ? "text-white" : "text-neutral-900"
      }`}
    >
      <Link
        href="/dashboard/impostazioni"
        className={`block min-w-0 rounded-md hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${
          onBrand ? "focus-visible:outline-white/80" : "focus-visible:outline-[var(--brand)]"
        }`}
        title={privileges ? `${name} — profilo personale` : `${name} — profilo personale`}
      >
        <p
          className={`truncate text-sm font-medium leading-tight ${
            onBrand ? "text-white" : "text-neutral-900"
          }`}
        >
          {name}
        </p>
        {privileges ? (
          <p
            className={`truncate text-[10px] leading-tight ${
              onBrand ? "text-white/70" : "text-neutral-500"
            }`}
          >
            {privileges}
          </p>
        ) : null}
      </Link>
    </div>
  );
}
