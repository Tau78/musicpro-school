import { redirect } from "next/navigation";

import { getWebsiteAdminState } from "@musicpro/database";

import { WebsiteContentPanel } from "@/components/admin/website-content-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSettings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function WebsiteAdminPage() {
  const member = await getAdminMember();
  if (!member || !canManageSettings(member.roles)) {
    redirect("/admin/associati");
  }

  const supabase = await createClient();
  const state = await getWebsiteAdminState(supabase);

  return (
    <WebsiteContentPanel
      initialDraft={state.draft}
      initialDirty={state.dirty}
    />
  );
}
