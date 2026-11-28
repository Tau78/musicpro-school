import { cache } from "react";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminShellNavConfig } from "@/lib/admin/shell-config";
import { uiSwitchOptions } from "@/lib/admin/ui-view";
import { getUiContext } from "@/lib/admin/ui-view.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const loadDashboardShell = cache(async () => {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    return null;
  }
  const ui = await getUiContext(member.roles);
  if (ui.view === "associato") {
    return { mode: "associate" as const };
  }
  const nav = await getAdminShellNavConfig(ui.roles);
  if (!nav) {
    return null;
  }
  const firstName = member.firstName.trim();
  const title = firstName ? `Ciao ${firstName}` : "Dashboard";
  const shellNav =
    ui.view === "docente"
      ? { ...nav, settingsHref: "/dashboard/impostazioni" }
      : nav;
  return {
    mode: "staff" as const,
    nav: shellNav,
    title,
    userRoles: member.roles,
    settingsLabel: ui.view === "docente" ? "Impostazioni" : "Impostazioni scuola",
    uiSwitch: ui.view
      ? { active: ui.view, options: uiSwitchOptions(member.roles) }
      : null,
  };
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = await loadDashboardShell();
  if (!shell || shell.mode === "associate") {
    return children;
  }

  return (
    <AdminShell
      nav={shell.nav}
      title={shell.title}
      wide
      userRoles={shell.userRoles}
      uiSwitch={shell.uiSwitch}
      settingsLabel={shell.settingsLabel}
    >
      {children}
    </AdminShell>
  );
}
