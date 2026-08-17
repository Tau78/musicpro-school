import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listDocumentSettings,
} from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { canManageSettings } from "@/lib/admin/roles";
import { DRIVE_SETTING_KEYS } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniDrivePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageSettings(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const settings = await listDocumentSettings(supabase);

  return (
    <AppSettingsPanel
      settings={settings}
      keys={DRIVE_SETTING_KEYS}
      title="Cartelle Google Drive"
      description="ID delle cartelle Drive legacy usate come riferimento per PDF storici di notule e iscrizioni."
      submitLabel="Salva Drive"
    />
  );
}
