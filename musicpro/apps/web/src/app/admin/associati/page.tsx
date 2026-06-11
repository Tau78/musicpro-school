import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles, listMembers } from "@musicpro/database";

import { MemberList } from "@/components/admin/member-list";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AssociatiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageMembers(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const members = await listMembers(supabase);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Rubrica associati
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Anagrafica completa degli associati MusicPro School.
        </p>
      </div>

      <MemberList members={members} canAdd />
    </div>
  );
}
