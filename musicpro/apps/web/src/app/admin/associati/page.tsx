import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listMemberAvailableCredits,
  listMemberIdsWithRole,
  listMembers,
  listMembersDetail,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { AssociatesBookButton } from "@/components/admin/associates-book-button";
import { CashEnrollmentCard } from "@/components/admin/cash-enrollment-card";
import { MemberList } from "@/components/admin/member-list";
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

  const [members, memberDetails, availableCredits, docenteIds] =
    await Promise.all([
      listMembers(supabase),
      listMembersDetail(supabase),
      listMemberAvailableCredits(supabase).catch(
        () => ({}) as Record<string, number>,
      ),
      listMemberIdsWithRole(supabase, MemberRole.Docente),
    ]);
  const showMerge = canMergeDuplicates(member.roles);

  const creditBalances = Object.fromEntries(
    members.map((m) => [m.id, availableCredits[m.id] ?? 0] as const),
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--brand)]">
            Rubrica associati
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Anagrafica completa degli associati MusicPro School.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AssociatesBookButton members={memberDetails} />
          {showMerge ? (
            <Link
              href="/admin/associati/duplicati"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Compatta duplicati
            </Link>
          ) : null}
        </div>
      </div>

      <CashEnrollmentCard />

      <MemberList
        members={members}
        canAdd
        creditBalances={creditBalances}
        docenteIds={docenteIds}
        canDelete={canDeleteMembers(member.roles)}
        currentStaffMemberId={member.id}
        currentStaffRoles={member.roles}
      />
    </div>
  );
}
