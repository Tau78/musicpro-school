import { redirect } from "next/navigation";

import {
  listDocumentSettings,
} from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { CollapsibleSection } from "@/components/admin/collapsible-section";
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
    <div className="space-y-10">
      <AppSettingsPanel
        settings={settings}
        keys={DOCUMENTI_SETTING_KEYS}
        title="Documenti e contatti"
        description="Email operative, bucket Storage, foglio legacy e fuso orario."
        submitLabel="Salva documenti"
      />

      <CollapsibleSection title="Import dati storici (Sheets)">
        <p className="text-sm text-neutral-600">
          Il wizard di import GAS non è stato ripristinato nell&apos;admin web.
          Per re-importare o verificare i dati da Google Sheets usare lo script
          one-shot dalla root del repository:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-xs text-neutral-100">
          npm run migrate:sheets -- --dry-run{"\n"}
          npm run migrate:sheets
        </pre>
        <p className="mt-2 text-sm text-neutral-500">
          Documentazione:{" "}
          <code className="text-xs">scripts/migrate-from-sheets/README.md</code>{" "}
          e <code className="text-xs">docs/CUTOVER.md</code>.
        </p>
      </CollapsibleSection>
    </div>
  );
}
