import type { SupabaseClient } from "@supabase/supabase-js";

import {
  currentFiscalYear,
  type Database,
  listAnnualQuotaSettings,
} from "@musicpro/database";
import { MemberRole, type MemberRoleValue } from "@musicpro/shared";

type MembershipClient = SupabaseClient<Database>;

export interface MembershipStatus {
  memberId: string;
  fiscalYear: number;
  formCompleted: boolean;
  quotaPaid: boolean;
  isComplete: boolean;
  quotaAmountEur: number | null;
}

function hasAssociatoOnly(roles: MemberRoleValue[]): boolean {
  const privileged = new Set<MemberRoleValue>([
    MemberRole.Admin,
    MemberRole.Docente,
    MemberRole.Segreteria,
  ]);

  if (roles.some((role) => privileged.has(role))) {
    return false;
  }

  return roles.includes(MemberRole.Associato);
}

export async function checkMemberQuotaPaid(
  client: MembershipClient,
  memberId: string,
  fiscalYear = currentFiscalYear(),
): Promise<boolean> {
  const { data, error } = await client.rpc("member_quota_ok", {
    p_member_id: memberId,
    p_fiscal_year: fiscalYear,
  });

  if (error) {
    const { data: quotaRow } = await client
      .from("member_annual_quotas")
      .select("paid_at")
      .eq("member_id", memberId)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle();

    return Boolean(quotaRow?.paid_at);
  }

  return Boolean(data);
}

async function checkFormCompleted(
  client: MembershipClient,
  memberId: string,
  fiscalYear: number,
): Promise<boolean> {
  const { data: member } = await client
    .from("members")
    .select("enrolled_at, gdpr_consent")
    .eq("id", memberId)
    .maybeSingle();

  if (member?.enrolled_at || member?.gdpr_consent) {
    return true;
  }

  const { data: enrollment } = await client
    .from("enrollments")
    .select("id, form_payload")
    .eq("member_id", memberId)
    .eq("fiscal_year", fiscalYear)
    .not("form_payload", "is", null)
    .limit(1)
    .maybeSingle();

  return Boolean(enrollment?.form_payload);
}

export async function getMembershipStatus(
  client: MembershipClient,
  memberId: string,
): Promise<MembershipStatus> {
  const fiscalYear = currentFiscalYear();
  const [formCompleted, quotaPaid, settings] = await Promise.all([
    checkFormCompleted(client, memberId, fiscalYear),
    checkMemberQuotaPaid(client, memberId, fiscalYear),
    listAnnualQuotaSettings(client),
  ]);

  const setting = settings.find((entry) => entry.fiscalYear === fiscalYear);

  return {
    memberId,
    fiscalYear,
    formCompleted,
    quotaPaid,
    isComplete: formCompleted && quotaPaid,
    quotaAmountEur: setting?.amountEur ?? null,
  };
}

export async function shouldEnforceOnboarding(
  client: MembershipClient,
  memberId: string,
  roles: MemberRoleValue[],
): Promise<boolean> {
  if (!hasAssociatoOnly(roles)) {
    return false;
  }

  const status = await getMembershipStatus(client, memberId);
  return !status.isComplete;
}

export { hasAssociatoOnly };
