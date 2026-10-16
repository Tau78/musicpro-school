import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@musicpro/database";

import { ensureMemberAuthAccess } from "@/lib/admin/staff-auth";

type ServiceClient = SupabaseClient<Database>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Primo associato in anagrafica con questa email (case-insensitive).
 * Allineato al trigger link_member_on_auth_signup (created_at ASC).
 */
export async function findPrimaryAssociatoMemberIdByEmail(
  service: ServiceClient,
  rawEmail: string,
): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  if (!email.includes("@")) return null;

  const { data: rows, error } = await service
    .from("members")
    .select("id, email, created_at")
    .ilike("email", email)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const matches = (rows ?? []).filter(
    (row) => normalizeEmail(row.email ?? "") === email,
  );
  if (matches.length === 0) return null;

  for (const row of matches) {
    const { data: roles, error: rolesError } = await service
      .from("member_roles")
      .select("role")
      .eq("member_id", row.id)
      .is("revoked_at", null);
    if (rolesError) {
      throw new Error(rolesError.message);
    }
    if ((roles ?? []).some((entry) => entry.role === "associato")) {
      return row.id;
    }
  }

  return null;
}

/** Crea/collega Auth se l'email è in rubrica associati (idempotente). */
export async function ensureAssociatoAuthForEmail(
  service: ServiceClient,
  rawEmail: string,
): Promise<boolean> {
  const memberId = await findPrimaryAssociatoMemberIdByEmail(service, rawEmail);
  if (!memberId) return false;

  const result = await ensureMemberAuthAccess(service, memberId);
  return result.status !== "no_email" && result.status !== "invalid_email";
}
