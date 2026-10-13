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
  /** Anagrafica minima già su `members` (nome+cognome+(email|cf)). */
  hasMemberAnagrafica: boolean;
  /** Può avviare il pay quota (form ok oppure anagrafica profilo). */
  canPayQuota: boolean;
  quotaPaid: boolean;
  isComplete: boolean;
  quotaAmountEur: number | null;
}

export function memberHasUsableAnagrafica(member: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  tax_code?: string | null;
}): boolean {
  const nome = String(member.first_name || "").trim();
  const cognome = String(member.last_name || "").trim();
  const email = String(member.email || "").trim();
  const cf = String(member.tax_code || "").trim();
  return Boolean(nome && cognome && (email || cf));
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

/**
 * Modulo firmato / anagrafica completa (non basta la quota).
 * Criterio allineato a completaInvio / salvaAggiornamentoAssociatoIscrizione:
 * bozza → no; CF + (GDPR o enrolled_at legacy) → sì; altrimenti form_payload enrollment.
 * Non usare solo enrolled_at: il vecchio trigger quota lo impostava senza firma.
 */
async function loadMembershipFormFlags(
  client: MembershipClient,
  memberId: string,
  fiscalYear: number,
): Promise<{ formCompleted: boolean; hasMemberAnagrafica: boolean }> {
  const { data: member } = await client
    .from("members")
    .select(
      "tax_code, gdpr_consent, enrolled_at, is_enrollment_draft, first_name, last_name, email",
    )
    .eq("id", memberId)
    .maybeSingle();

  const hasMemberAnagrafica = member
    ? memberHasUsableAnagrafica(member)
    : false;

  if (!member || member.is_enrollment_draft) {
    return { formCompleted: false, hasMemberAnagrafica };
  }

  const taxCode = String(member.tax_code || "").trim();
  if (taxCode && (member.gdpr_consent || member.enrolled_at)) {
    return { formCompleted: true, hasMemberAnagrafica };
  }

  const { data: enrollment } = await client
    .from("enrollments")
    .select("id, form_payload")
    .eq("member_id", memberId)
    .eq("fiscal_year", fiscalYear)
    .not("form_payload", "is", null)
    .limit(1)
    .maybeSingle();

  return {
    formCompleted: Boolean(enrollment?.form_payload),
    hasMemberAnagrafica,
  };
}

export async function getMembershipStatus(
  client: MembershipClient,
  memberId: string,
): Promise<MembershipStatus> {
  const fiscalYear = currentFiscalYear();
  const [flags, quotaPaid, settings] = await Promise.all([
    loadMembershipFormFlags(client, memberId, fiscalYear),
    checkMemberQuotaPaid(client, memberId, fiscalYear),
    listAnnualQuotaSettings(client),
  ]);

  const setting = settings.find((entry) => entry.fiscalYear === fiscalYear);
  const { formCompleted, hasMemberAnagrafica } = flags;
  // Rinnovo/app: anagrafica su members basta per mint Nexi; modulo formale resta formCompleted.
  const canPayQuota = formCompleted || hasMemberAnagrafica;

  return {
    memberId,
    fiscalYear,
    formCompleted,
    hasMemberAnagrafica,
    canPayQuota,
    quotaPaid,
    // Onboarding completo solo con modulo formale + quota (non solo anagrafica minima).
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

export function isAssociatoMember(roles: MemberRoleValue[]): boolean {
  return roles.includes(MemberRole.Associato);
}

export { hasAssociatoOnly };
