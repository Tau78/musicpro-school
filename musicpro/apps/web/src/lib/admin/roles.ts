import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

export function canAccessAdmin(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria) ||
    roles.includes(MemberRole.Docente)
  );
}

export function canManageMembers(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export function canManageQuotas(roles: MemberRoleValue[]): boolean {
  return canManageMembers(roles);
}

export function canManageReimbursements(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Docente)
  );
}

export function canManageBookings(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export function canDeleteReimbursements(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

export function canDeleteMembers(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

/** Compatta duplicati associati — solo admin. */
export function canMergeDuplicates(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

export function canManageShop(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export function canDeleteCreditPackages(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

export function canManageSettings(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export function canManageRooms(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export function canManagePenalties(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

export function canManageTemplates(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria)
  );
}

/** Sezione Documenti in nav: admin sempre; segreteria con base impostazioni. */
export function canAccessDocumenti(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    (roles.includes(MemberRole.Segreteria) && canManageSettings(roles))
  );
}
