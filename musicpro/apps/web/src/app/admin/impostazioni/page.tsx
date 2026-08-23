import { redirect } from "next/navigation";

import {
  getAppBookingSettings,
  listCancellationPenaltyRules,
} from "@musicpro/database";

import {
  PrenotazioniSettingsWorkspace,
  type PrenotazioniSettingsSection,
} from "@/components/admin/prenotazioni-settings-workspace";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManagePenalties, canManageSettings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

function parseSection(value: string | undefined): PrenotazioniSettingsSection {
  if (value === "penali" || value === "crediti" || value === "rimborsi") {
    return value === "rimborsi" ? "crediti" : value;
  }
  return "soglie";
}

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ sezione?: string }>;
}) {
  const supabase = await createClient();
  const member = await getAdminMember();
  const { sezione } = await searchParams;
  const section = parseSection(sezione);

  if (
    !member ||
    (!canManageSettings(member.roles) && !canManagePenalties(member.roles))
  ) {
    redirect("/admin/rimborsi");
  }

  const [settings, rules] = await Promise.all([
    getAppBookingSettings(supabase),
    listCancellationPenaltyRules(supabase).catch(() => []),
  ]);

  return (
    <PrenotazioniSettingsWorkspace
      initialSection={section}
      settings={settings}
      rules={rules}
    />
  );
}
