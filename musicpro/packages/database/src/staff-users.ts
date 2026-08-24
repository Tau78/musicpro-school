import type { SupabaseClient } from "@supabase/supabase-js";

import { MemberRole } from "@musicpro/shared";

import { listMemberIdsWithRole } from "./member-roles";
import type { Database } from "./types/database";

type StaffClient = SupabaseClient<Database>;

export interface StaffUserRow {
  id: string;
  userId: string | null;
  memberNumber: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  isAdmin: boolean;
  isSegreteria: boolean;
}

export interface StaffAddCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  memberNumber: number | null;
}

type MemberStaffRow = {
  id: string;
  user_id: string | null;
  member_number: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
};

function mapStaffRow(
  row: MemberStaffRow,
  adminIds: Set<string>,
  segreteriaIds: Set<string>,
): StaffUserRow {
  return {
    id: row.id,
    userId: row.user_id,
    memberNumber: row.member_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    isAdmin: adminIds.has(row.id),
    isSegreteria: segreteriaIds.has(row.id),
  };
}

export async function listStaffUsers(
  client: StaffClient,
): Promise<StaffUserRow[]> {
  const [adminIds, segreteriaIds] = await Promise.all([
    listMemberIdsWithRole(client, MemberRole.Admin),
    listMemberIdsWithRole(client, MemberRole.Segreteria),
  ]);
  const ids = [...new Set([...adminIds, ...segreteriaIds])];
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("members")
    .select("id, user_id, member_number, first_name, last_name, email")
    .in("id", ids)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(`Impossibile caricare gli utenti staff: ${error.message}`);
  }

  const adminSet = new Set(adminIds);
  const segreteriaSet = new Set(segreteriaIds);
  return ((data ?? []) as MemberStaffRow[]).map((row) =>
    mapStaffRow(row, adminSet, segreteriaSet),
  );
}

export async function listStaffAddCandidates(
  client: StaffClient,
): Promise<StaffAddCandidate[]> {
  const staff = await listStaffUsers(client);
  const staffIds = new Set(staff.map((row) => row.id));

  const { data, error } = await client
    .from("members")
    .select("id, member_number, first_name, last_name, email")
    .eq("is_active", true)
    .eq("is_enrollment_draft", false)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(
      `Impossibile caricare gli associati da aggiungere: ${error.message}`,
    );
  }

  return ((data ?? []) as MemberStaffRow[])
    .filter((row) => !staffIds.has(row.id))
    .map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      memberNumber: row.member_number,
    }));
}
