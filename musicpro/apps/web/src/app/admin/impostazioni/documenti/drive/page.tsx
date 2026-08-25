import { redirect } from "next/navigation";

import {
  listDocumentSettings,
} from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSettings } from "@/lib/admin/roles";
import { DRIVE_SETTING_KEYS } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniDrivePage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageSettings(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const settings = await listDocumentSettings(supabase);

  return (
    <AppSettingsPanel
      settings={settings}
      keys={DRIVE_SETTING_KEYS}
      submitLabel="Salva cartelle"
    />
  );
}
