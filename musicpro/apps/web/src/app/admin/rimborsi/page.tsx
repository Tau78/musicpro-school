import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listMembers,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { ReimbursementsPanel } from "@/components/admin/reimbursements-panel";
import {
  canDeleteReimbursements,
  canManageReimbursements,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function RimborsiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageReimbursements(member.roles)) {
    redirect("/admin/associati");
  }

  const members = await listMembers(supabase);
  const currentYear = new Date().getFullYear();
  const isDocenteOnly =
    member.roles.includes(MemberRole.Docente) &&
    !member.roles.includes(MemberRole.Admin);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Rimborsi</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Gestione notule spese e ricevute cartacee.
        </p>
      </div>

      <ReimbursementsPanel
        initialYear={currentYear}
        members={members}
        canDelete={canDeleteReimbursements(member.roles)}
        isDocenteOnly={isDocenteOnly}
      />
    </div>
  );
}
