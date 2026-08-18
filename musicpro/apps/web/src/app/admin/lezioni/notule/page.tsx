import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { PayrollStaffPanel } from "@/components/lezioni/payroll-staff-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";

export default async function AdminLezioniNotulePage() {
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  return <PayrollStaffPanel actorMemberId={member.id} />;
}
