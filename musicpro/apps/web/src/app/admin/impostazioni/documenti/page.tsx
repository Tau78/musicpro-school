import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listDocumentSettings,
} from "@musicpro/database";

import { AppSettingsPanel } from "@/components/admin/app-settings-panel";
import { canManageSettings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniDocumentiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageSettings(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const settings = await listDocumentSettings(supabase);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Impostazioni
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Path Drive legacy, template, bucket Storage e email di contatto.
        </p>
      </div>

      <nav className="mb-8 flex flex-wrap gap-2 border-b border-neutral-200 pb-3 text-sm">
        <Link
          href="/admin/impostazioni"
          className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          Prenotazioni
        </Link>
        <span className="rounded-lg bg-[var(--brand)] px-3 py-1.5 font-medium text-white">
          Documenti / Drive
        </span>
      </nav>

      <AppSettingsPanel settings={settings} />
    </div>
  );
}
