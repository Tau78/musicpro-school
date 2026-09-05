import { redirect } from "next/navigation";

import {
  getAppBookingSettings,
  listCancellationPenaltyRules,
  listRooms,
  todayInRome,
} from "@musicpro/database";

import { CalendarExportBar } from "@/components/admin/calendar-export-bar";
import {
  PrenotazioniSettingsWorkspace,
  type PrenotazioniSettingsSection,
} from "@/components/admin/prenotazioni-settings-workspace";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManagePenalties, canManageSettings } from "@/lib/admin/roles";
import { weekBounds } from "@/lib/lezioni/calendar-range";
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

  const [settings, rules, rooms] = await Promise.all([
    getAppBookingSettings(supabase),
    listCancellationPenaltyRules(supabase).catch(() => []),
    listRooms(supabase),
  ]);

  const today = todayInRome();
  const exportBounds = weekBounds(today, false);
  const roomOptions = rooms.map((room) => ({ id: room.id, name: room.name }));

  return (
    <PrenotazioniSettingsWorkspace
      initialSection={section}
      settings={settings}
      rules={rules}
      exportRooms={roomOptions}
      exportDefaultFrom={exportBounds.from}
      exportDefaultTo={exportBounds.to}
    />
  );
}
