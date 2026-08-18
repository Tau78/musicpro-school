import { redirect } from "next/navigation";

import {
  listDocumentSettings,
  listMessageTemplates,
} from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { CollapsibleSection } from "@/components/admin/collapsible-section";
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
    <div className="space-y-10">
      {canManageTemplates(member.roles) ? (
        <CollapsibleSection
          title="Modelli messaggio"
          description="Template per messaggi massivi email e Telegram (rubrica → selezione associati → Invia messaggio)."
          defaultOpen
        >
          <MessageTemplatesPanel
            templates={templates}
            createdBy={member.id}
          />
        </CollapsibleSection>
      ) : null}

      {canManageSettings(member.roles) ? (
        <AppSettingsPanel
          settings={settings}
          keys={TEMPLATE_SETTING_KEYS}
          title="Template Google Doc (legacy)"
          description="ID dei documenti Google usati come modello per notule e iscrizioni generate da GAS."
          submitLabel="Salva template Drive"
        />
      ) : null}
    </div>
  );
}
