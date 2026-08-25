import { redirect } from "next/navigation";

import { listDocumentSettings } from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSettings } from "@/lib/admin/roles";
import { DOCUMENTI_SETTING_KEYS } from "@/lib/admin/settings-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniDocumentiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageSettings(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const settings = await listDocumentSettings(supabase);

  return (
    <div className="space-y-6">
      <AppSettingsPanel
        settings={settings}
        keys={DOCUMENTI_SETTING_KEYS}
        submitLabel="Salva"
      />

      <details className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">
          Import dati storici
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-neutral-600">Dalla root del progetto:</p>
          <pre className="overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-xs text-neutral-100">
            npm run migrate:sheets -- --dry-run{"\n"}
            npm run migrate:sheets
          </pre>
          <p className="text-sm text-neutral-500">
            Guida:{" "}
            <code className="text-xs">scripts/migrate-from-sheets/README.md</code>{" "}
            e <code className="text-xs">docs/CUTOVER.md</code>.
          </p>
        </div>
      </details>
    </div>
  );
}
