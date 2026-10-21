import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { FiscalReceiptsPanel } from "@/components/admin/fiscal-receipts-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";

export default async function AdminRicevutePage() {
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  return <FiscalReceiptsPanel actorMemberId={member.id} />;
}
