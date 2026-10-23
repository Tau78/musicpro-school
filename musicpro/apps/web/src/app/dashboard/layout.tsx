import { cache } from "react";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminShellNavConfig } from "@/lib/admin/shell-config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const loadDashboardShell = cache(async () => {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return null;
  }
  const nav = await getAdminShellNavConfig(member.roles);
  if (!nav) {
    return null;
  }
  const firstName = member.firstName.trim();
  const title = firstName ? `Ciao ${firstName}` : "Dashboard";
  return {
    nav,
    title,
    userRoles: member.roles,
  };
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = await loadDashboardShell();
  if (!shell) {
    return children;
  }

  return (
    <AdminShell
      nav={shell.nav}
      title={shell.title}
      wide
      userRoles={shell.userRoles}
    >
      {children}
    </AdminShell>
  );
}
