import { redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  listCoursePackPrices,
  listLessonSubjects,
  listSchoolClosures,
  listSchoolCourseTerms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { AdminLezioniSettingsPanel } from "@/components/lezioni/admin-lezioni-settings-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLezioniImpostazioniPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  const [terms, packPrices, closures, subjects, settings] = await Promise.all([
    listSchoolCourseTerms(supabase),
    listCoursePackPrices(supabase),
    listSchoolClosures(supabase),
    listLessonSubjects(supabase, { includeInactive: true }),
    getLessonSchoolSettings(supabase),
  ]);
  const currentTerm = terms.find((term) => term.isCurrent) ?? null;

  return (
    <AdminLezioniSettingsPanel
      settings={settings}
      currentTerm={
        currentTerm
          ? {
              id: currentTerm.id,
              label: currentTerm.label,
              startsOn: currentTerm.startsOn,
              endsOn: currentTerm.endsOn,
            }
          : null
      }
      terms={terms.map((term) => ({
        id: term.id,
        label: term.label,
        startsOn: term.startsOn,
        endsOn: term.endsOn,
        isCurrent: term.isCurrent,
      }))}
      packPrices={packPrices.map((row) => ({
        id: row.id,
        courseKind: row.courseKind,
        durationMinutes: row.durationMinutes,
        amountEur: row.amountEur,
      }))}
      closures={closures.map((row) => ({
        id: row.id,
        title: row.title,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        repeatsYearly: row.repeatsYearly,
      }))}
      subjects={subjects.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive,
      }))}
    />
  );
}
