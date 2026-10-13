import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

/** Admin, segreteria, o collaboratore allo sportello (prenotazioni + cespiti). */
export function isFrontDesk(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Admin) ||
    roles.includes(MemberRole.Segreteria) ||
    roles.includes(MemberRole.Collaboratore)
  );
}

export function canAccessAdmin(roles: MemberRoleValue[]): boolean {
  return isFrontDesk(roles) || roles.includes(MemberRole.Docente);
}

/** Rubrica per crediti, link quota e iscrizione. Non include lezioni né anagrafica completa. */
export function canAccessMemberDesk(roles: MemberRoleValue[]): boolean {
  return isFrontDesk(roles);
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
  return isFrontDesk(roles);
}

export function canDeleteReimbursements(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

export function canDeleteMembers(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Admin);
}

/** Privilegi staff e password degli altri account — solo admin. */
export function canManageStaffUsers(roles: MemberRoleValue[]): boolean {
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

/** Oggetti Market dell'associazione. Il Market personale resta sul dashboard. */
export function canManageSchoolMarket(roles: MemberRoleValue[]): boolean {
  return canManageShop(roles) || roles.includes(MemberRole.Collaboratore);
}

/** Collaboratore senza segreteria: solo il catalogo scuola, non gli annunci degli associati. */
export function isSchoolMarketDeskOnly(roles: MemberRoleValue[]): boolean {
  return (
    roles.includes(MemberRole.Collaboratore) && !canManageShop(roles)
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
