import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AuthSession,
  Member,
  MemberRoleValue,
  MemberWithRoles,
} from "@musicpro/shared";

import type { Database } from "./types/database";

type AuthClient = SupabaseClient<Database>;

type MemberRow = {
  id: string;
  user_id: string | null;
  member_number: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  is_active: boolean;
};

function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    userId: row.user_id,
    memberNumber: row.member_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    isActive: row.is_active,
  };
}

export async function getSession(client: AuthClient): Promise<AuthSession | null> {
  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error || !session) {
    return null;
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
  };
}

export async function ensureMemberLinked(client: AuthClient): Promise<string | null> {
  const { data, error } = await client.rpc("ensure_member_linked");

  if (error) {
    console.error("[auth] ensure_member_linked failed:", error.message);
    return null;
  }

  return data;
}

export async function getCurrentMember(client: AuthClient): Promise<Member | null> {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    return null;
  }

  await ensureMemberLinked(client);

  const { data, error } = await client
    .from("members")
    .select(
      "id, user_id, member_number, first_name, last_name, email, is_active",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapMember(data as MemberRow);
}

export async function getMemberRoles(
  client: AuthClient,
  memberId: string,
): Promise<MemberRoleValue[]> {
  const { data, error } = await client
    .from("member_roles")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);

  if (error || !data) {
    return [];
  }

  return data.map((row) => row.role as MemberRoleValue);
}

export async function getCurrentMemberWithRoles(
  client: AuthClient,
): Promise<MemberWithRoles | null> {
  const member = await getCurrentMember(client);

  if (!member) {
    return null;
  }

  const roles = await getMemberRoles(client, member.id);

  return { ...member, roles };
}
