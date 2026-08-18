import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";

export default async function AdminLezioniHubPage() {
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  redirect("/admin/lezioni/oggi");
}
