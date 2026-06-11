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

export function canManageReimbursements(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Docente)
  );
}

export function canDeleteReimbursements(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

export function canDeleteMembers(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}
