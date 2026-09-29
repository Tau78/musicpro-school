import Link from "next/link";
import { redirect } from "next/navigation";

import {
  currentFiscalYear,
  listAnnualQuotaSettings,
  listMemberAnnualQuotas,
  listMemberAvailableCredits,
  listMemberIdsWithRole,
  listMembers,
  listMembersDetail,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { AssociatiWorkspace } from "@/components/admin/associati-workspace";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canDeleteMembers,
  canManageMembers,
  canMergeDuplicates,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AssociatiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const fiscalYear = currentFiscalYear();

  const [
    members,
    memberDetails,
    availableCredits,
    docenteIds,
    yearQuotas,
    quotaSettings,
  ] = await Promise.all([
    listMembers(supabase),
    listMembersDetail(supabase),
    listMemberAvailableCredits(supabase).catch(
      () => ({}) as Record<string, number>,
    ),
    listMemberIdsWithRole(supabase, MemberRole.Docente),
    listMemberAnnualQuotas(supabase, { fiscalYear }),
    listAnnualQuotaSettings(supabase),
  ]);
  const showMerge = canMergeDuplicates(member.roles);

  const creditBalances = Object.fromEntries(
    members.map((m) => [m.id, availableCredits[m.id] ?? 0] as const),
  );

  const paidQuotaIds = new Set(
    yearQuotas.filter((q) => Boolean(q.paidAt)).map((q) => q.memberId),
  );
  const unpaidQuotaMemberIds = members
    .filter((m) => !m.isEnrollmentDraft && !paidQuotaIds.has(m.id))
    .map((m) => m.id);
  const unpaidQuotaAmountEur =
    quotaSettings.find((s) => s.fiscalYear === fiscalYear)?.amountEur ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[var(--brand)] sm:text-2xl">
            Rubrica associati
          </h2>
          <p className="hidden text-sm text-neutral-600 sm:block">
            Anagrafica completa degli associati MusicPro School.
          </p>
        </div>
        <Link
          href="/admin/associati/nuovo"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 sm:px-4"
        >
          + Nuovo
        </Link>
      </div>

      <AssociatiWorkspace
        memberDetails={memberDetails}
        showMerge={showMerge}
        listProps={{
          members,
          creditBalances,
          docenteIds,
          unpaidQuotaMemberIds,
          unpaidQuotaYear: fiscalYear,
          unpaidQuotaAmountEur,
          canDelete: canDeleteMembers(member.roles),
          currentStaffMemberId: member.id,
          currentStaffRoles: member.roles,
        }}
      />
    </div>
  );
}
