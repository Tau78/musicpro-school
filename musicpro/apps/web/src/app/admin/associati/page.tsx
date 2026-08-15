import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getMemberCreditBalance,
  listMembers,
  listMembersDetail,
} from "@musicpro/database";

import { AssociatesBookButton } from "@/components/admin/associates-book-button";
import { MemberList } from "@/components/admin/member-list";
import {
  canManageMembers,
  canMergeDuplicates,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AssociatiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageMembers(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const [members, memberDetails] = await Promise.all([
    listMembers(supabase),
    listMembersDetail(supabase),
  ]);
  const showMerge = canMergeDuplicates(member.roles);

  const creditBalances = Object.fromEntries(
    await Promise.all(
      members.map(async (m) => {
        try {
          const balance = await getMemberCreditBalance(supabase, m.id);
          return [m.id, balance.available] as const;
        } catch {
          return [m.id, null] as const;
        }
      }),
    ),
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

      <MemberList members={members} canAdd creditBalances={creditBalances} />
    </div>
  );
}
