import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getNextMemberNumber,
} from "@musicpro/database";

import { MemberForm } from "@/components/admin/member-form";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function NuovoAssociatoPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageMembers(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const nextNumber = await getNextMemberNumber(supabase);

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
          Nuovo associato
        </h2>
      </div>

      <MemberForm defaultMemberNumber={nextNumber} />
    </div>
  );
}
