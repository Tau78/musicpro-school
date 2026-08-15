import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listMessageTemplates,
} from "@musicpro/database";

import { MessageTemplatesPanel } from "@/components/admin/message-templates-panel";
import { canManageTemplates } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageTemplates(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const templates = await listMessageTemplates(supabase);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Modelli messaggio
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Gestisci i template per messaggi massivi email e Telegram (rubrica →
          selezione associati → Invia messaggio).
        </p>
      </div>

      <MessageTemplatesPanel
        templates={templates}
        createdBy={member.id}
      />
    </div>
  );
}
