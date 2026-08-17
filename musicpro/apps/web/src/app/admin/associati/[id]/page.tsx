import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getMemberById,
  getMemberCreditBalance,
  listMemberAnnualQuotas,
  listMemberCreditTransactions,
} from "@musicpro/database";

import { MemberCreditsPanel } from "@/components/admin/member-credits-panel";
import { MemberForm } from "@/components/admin/member-form";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canDeleteMembers,
  canManageMembers,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssociatoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const currentMember = await getAdminMember();

  if (!currentMember || !canManageMembers(currentMember.roles)) {
    redirect("/admin/rimborsi");
  }

  const member = await getMemberById(supabase, id);

  if (!member) {
    notFound();
  }

  const [creditBalance, creditTransactions, quotas] = await Promise.all([
    getMemberCreditBalance(supabase, id),
    listMemberCreditTransactions(supabase, id),
    listMemberAnnualQuotas(supabase, { memberId: id }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/associati"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna alla rubrica
        </Link>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--brand)]">
          {member.lastName} {member.firstName}
        </h2>
      </div>

      <MemberForm
        member={member}
        canDelete={canDeleteMembers(currentMember.roles)}
        quotas={quotas}
      />

      <MemberCreditsPanel
        memberId={member.id}
        initialBalance={creditBalance}
        initialTransactions={creditTransactions}
      />
    </div>
  );
}
