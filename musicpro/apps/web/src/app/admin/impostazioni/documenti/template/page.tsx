import { redirect } from "next/navigation";

import {
  listDocumentSettings,
  listMessageTemplates,
} from "@musicpro/database";

import {
  AppSettingsPanel,
  TemplateSettingsLayout,
} from "@/components/admin/app-settings-panel";
import { MessageTemplatesPanel } from "@/components/admin/message-templates-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSettings, canManageTemplates } from "@/lib/admin/roles";
import { TEMPLATE_SETTING_KEYS } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniTemplatePage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (
    !member ||
    (!canManageTemplates(member.roles) && !canManageSettings(member.roles))
  ) {
    redirect("/admin/rimborsi");
  }

  const [settings, templates] = await Promise.all([
    listDocumentSettings(supabase),
    listMessageTemplates(supabase),
  ]);

  return (
    <TemplateSettingsLayout
      templatesPanel={
        canManageTemplates(member.roles) ? (
          <MessageTemplatesPanel
            templates={templates}
            createdBy={member.id}
          />
        ) : undefined
      }
      settingsPanel={
        canManageSettings(member.roles) ? (
          <AppSettingsPanel
            settings={settings}
            keys={TEMPLATE_SETTING_KEYS}
            title="Modelli documenti"
            submitLabel="Salva"
          />
        ) : undefined
      }
    />
  );
}
