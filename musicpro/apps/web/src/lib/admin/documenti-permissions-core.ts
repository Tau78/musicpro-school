import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

import { canManageMembers, canManageSettings } from "@/lib/admin/roles";

/** Pure helpers + tipi — sicuro per Client Components (niente next/headers). */

export type DocumentiSubsection =
  | "libro_associati"
  | "verbali"
  | "libro_cespiti";

export type DocumentiSegreteriaFlags = Record<DocumentiSubsection, boolean>;

export function canAccessDocumentiSubsection(
  roles: MemberRoleValue[],
  subsection: DocumentiSubsection,
  flags: DocumentiSegreteriaFlags,
): boolean {
  if (roles.includes(MemberRole.Admin)) return true;
  if (
    roles.includes(MemberRole.Collaboratore) &&
    subsection === "libro_cespiti"
  ) {
    return true;
  }
  if (!canManageSettings(roles)) return false;
  if (roles.includes(MemberRole.Segreteria)) return flags[subsection];
  return false;
}

export function canManageDocumentiPermissions(
  roles: MemberRoleValue[],
): boolean {
  return roles.includes(MemberRole.Admin);
}

/** Registro ricevute fiscali (segreteria / admin). */
export function canAccessDocumentiRicevute(
  roles: MemberRoleValue[],
): boolean {
  return canManageMembers(roles);
}

export function hasAnyDocumentiSubsection(
  roles: MemberRoleValue[],
  flags: DocumentiSegreteriaFlags,
): boolean {
  if (roles.includes(MemberRole.Admin)) return true;
  if (roles.includes(MemberRole.Collaboratore)) return true;
  if (canAccessDocumentiRicevute(roles)) return true;
  if (!canManageSettings(roles)) return false;
  return flags.libro_associati || flags.verbali || flags.libro_cespiti;
}
