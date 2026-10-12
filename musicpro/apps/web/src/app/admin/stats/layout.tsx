import { Suspense } from "react";
import { redirect } from "next/navigation";

import { StatsWorkspaceNav } from "@/components/admin/stats-workspace-nav";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";

export default async function AdminStatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getAdminMember();

  if (!member || !canManageBookings(member.roles)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <Suspense fallback={null}>
        <StatsWorkspaceNav />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
