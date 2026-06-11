import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import {
  canManageMembers,
  canManageReimbursements,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminIndexPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login");
  }

  if (canManageMembers(member.roles)) {
    redirect("/admin/associati");
  }

  if (canManageReimbursements(member.roles)) {
    redirect("/admin/rimborsi");
  }

  redirect("/dashboard?error=unauthorized");
}
