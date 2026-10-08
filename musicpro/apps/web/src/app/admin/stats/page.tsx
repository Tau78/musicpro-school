import { redirect } from "next/navigation";

import { AdminStatsDashboard } from "@/components/admin/admin-stats-dashboard";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";

export default async function AdminStatsPage() {
  const member = await getAdminMember();

  if (!member || !canManageBookings(member.roles)) {
    redirect("/dashboard");
  }

  return <AdminStatsDashboard />;
}
