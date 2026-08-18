import type { SupabaseClient } from "@supabase/supabase-js";

import type { MemberRoleValue } from "@musicpro/shared";

import type { Database, MemberRoleEnum } from "./types/database";

type RolesClient = SupabaseClient<Database>;

export interface RoleMutationResult {
  success: boolean;
  errorMessage?: string;
}

function toDbRole(role: MemberRoleValue): MemberRoleEnum {
  return role as MemberRoleEnum;
}

export async function grantMemberRole(
  client: RolesClient,
  memberId: string,
  role: MemberRoleValue,
  grantedByMemberId: string | null,
): Promise<RoleMutationResult> {
  const dbRole = toDbRole(role);
  const grantedAt = new Date().toISOString();

  const { data: existing, error: lookupError } = await client
    .from("member_roles")
    .select("id, revoked_at")
    .eq("member_id", memberId)
    .eq("role", dbRole)
    .maybeSingle();

  if (lookupError) {
    return { success: false, errorMessage: lookupError.message };
  }

  if (existing) {
    if (existing.revoked_at == null) {
      return { success: true };
    }

    const { error } = await client
      .from("member_roles")
      .update({
        revoked_at: null,
        granted_at: grantedAt,
        granted_by: grantedByMemberId,
      })
      .eq("id", existing.id);

    if (error) {
      return { success: false, errorMessage: error.message };
    }

    return { success: true };
  }

  const { error } = await client.from("member_roles").insert({
    member_id: memberId,
    role: dbRole,
    granted_at: grantedAt,
    granted_by: grantedByMemberId,
  });

  if (error) {
    return { success: false, errorMessage: error.message };
  }

  return { success: true };
}

export async function revokeMemberRole(
  client: RolesClient,
  memberId: string,
  role: MemberRoleValue,
): Promise<RoleMutationResult> {
  const { error } = await client
    .from("member_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("member_id", memberId)
    .eq("role", toDbRole(role))
    .is("revoked_at", null);

  if (error) {
    return { success: false, errorMessage: error.message };
  }

  return { success: true };
}

export async function listMemberIdsWithRole(
  client: RolesClient,
  role: MemberRoleValue,
): Promise<string[]> {
  const { data, error } = await client
    .from("member_roles")
    .select("member_id")
    .eq("role", toDbRole(role))
    .is("revoked_at", null);

  if (error) {
    throw new Error(
      `Impossibile caricare i membri con ruolo ${role}: ${error.message}`,
    );
  }

  return [...new Set((data ?? []).map((row) => row.member_id))];
}

export async function setMemberHasRole(
  client: RolesClient,
  memberId: string,
  role: MemberRoleValue,
  enabled: boolean,
  grantedByMemberId: string | null,
): Promise<RoleMutationResult> {
  if (enabled) {
    return grantMemberRole(client, memberId, role, grantedByMemberId);
  }

  return revokeMemberRole(client, memberId, role);
}
