import { getCurrentMemberWithRoles } from "@musicpro/database";

import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminShellNavConfig } from "@/lib/admin/shell-config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    return children;
  }

  const nav = await getAdminShellNavConfig(member.roles);
  if (!nav) {
    return children;
  }

  const firstName = member.firstName.trim();
  const title = firstName ? `Ciao, ${firstName}` : "Dashboard";

  return (
    <AdminShell nav={nav} title={title} wide>
      {children}
    </AdminShell>
  );
}
