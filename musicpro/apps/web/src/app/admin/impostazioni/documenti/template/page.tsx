import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listDocumentSettings,
  listMessageTemplates,
} from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { MessageTemplatesPanel } from "@/components/admin/message-templates-panel";
import { canManageSettings, canManageTemplates } from "@/lib/admin/roles";
import { TEMPLATE_SETTING_KEYS } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniTemplatePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

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
        <section>
          <h3 className="mb-2 text-lg font-semibold text-[var(--brand)]">
            Modelli messaggio
          </h3>
          <p className="mb-6 text-sm text-neutral-600">
            Template per messaggi massivi email e Telegram (rubrica → selezione
            associati → Invia messaggio).
          </p>
          <MessageTemplatesPanel
            templates={templates}
            createdBy={member.id}
          />
        </section>
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
