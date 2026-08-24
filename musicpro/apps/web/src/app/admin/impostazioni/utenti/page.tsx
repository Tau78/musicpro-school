import { redirect } from "next/navigation";

import {
  listStaffAddCandidates,
  listStaffUsers,
} from "@musicpro/database";

import { StaffUsersPanel } from "@/components/admin/staff-users-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageStaffUsers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniUtentiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageStaffUsers(member.roles)) {
    redirect("/admin/impostazioni");
  }

  const [users, candidates] = await Promise.all([
    listStaffUsers(supabase),
    listStaffAddCandidates(supabase),
  ]);

  return (
    <StaffUsersPanel
      users={users}
      candidates={candidates}
      currentStaffMemberId={member.id}
    />
  );
}
