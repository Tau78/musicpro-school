/** Matches `public.member_role` enum in Supabase schema */
export enum MemberRole {
  Admin = "admin",
  Docente = "docente",
  Associato = "associato",
  Segreteria = "segreteria",
  Social = "social",
  Tutore = "tutore",
}

export const MEMBER_ROLES = Object.values(MemberRole) as MemberRole[];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  [MemberRole.Admin]: "Amministratore",
  [MemberRole.Docente]: "Docente",
  [MemberRole.Associato]: "Associato",
  [MemberRole.Segreteria]: "Segreteria",
  [MemberRole.Social]: "Social",
  [MemberRole.Tutore]: "Tutore",
};
