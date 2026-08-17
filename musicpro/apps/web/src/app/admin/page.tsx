import { redirect } from "next/navigation";

import { getAdminMember } from "@/lib/admin/current-member";
import {
  canManageBookings,
  canManageMembers,
  canManageReimbursements,
} from "@/lib/admin/roles";

export default async function AdminIndexPage() {
  const member = await getAdminMember();

  if (!member) {
    redirect("/login");
  }

  if (canManageMembers(member.roles)) {
    redirect("/admin/associati");
  }

  if (canManageBookings(member.roles)) {
    redirect("/admin/prenotazioni");
  }

  if (canManageReimbursements(member.roles)) {
    redirect("/admin/rimborsi");
  }

  redirect("/dashboard?error=unauthorized");
}
