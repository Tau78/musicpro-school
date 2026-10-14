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
      title={privileges ? `${name} — ${privileges}` : name}
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
    </div>
  );
}
