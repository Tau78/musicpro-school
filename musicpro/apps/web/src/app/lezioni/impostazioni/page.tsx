import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getLessonSchoolSettings,
  listTeacherAvailability,
  listTeacherTimeOff,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { TeacherAvailabilityPanel } from "@/components/lezioni/teacher-availability-panel";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniImpostazioniPage() {
  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);

  if (!currentMember?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const [slots, timeOff, settings] = await Promise.all([
    listTeacherAvailability(supabase, currentMember.id),
    listTeacherTimeOff(supabase, currentMember.id),
    getLessonSchoolSettings(supabase),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Impostazioni
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Disponibilità settimanale e ferie.
        </p>
      </div>

      <TeacherAvailabilityPanel
        memberId={currentMember.id}
        initialSlots={slots}
        initialTimeOff={timeOff}
        sundayVisible={settings?.sundayVisible ?? false}
        gridOpenMinute={settings?.gridOpenMinute ?? 600}
        gridCloseMinute={settings?.gridCloseMinute ?? 1380}
      />
    </div>
  );
}
