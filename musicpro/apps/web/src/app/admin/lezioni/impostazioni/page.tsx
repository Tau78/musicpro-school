import { redirect } from "next/navigation";

import {
  formatDateItalian,
  getLessonSchoolSettings,
  listCoursePackPrices,
  listLessonSubjects,
  listSchoolClosures,
  listSchoolCourseTerms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { CourseTermForm } from "@/components/lezioni/course-term-form";
import { LessonSchoolSettingsForm } from "@/components/lezioni/lesson-school-settings-form";
import { LessonSubjectsForm } from "@/components/lezioni/lesson-subjects-form";
import { PackPriceForm } from "@/components/lezioni/pack-price-form";
import { SchoolClosuresForm } from "@/components/lezioni/school-closures-form";
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
    <div>
      <div className="space-y-8">
        {settings ? <LessonSchoolSettingsForm settings={settings} /> : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Impostazioni scuola non trovate. Controlla la riga singleton in
            database.
          </p>
        )}

        <CourseTermForm
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
        />

        <CollapsibleSection title="Anni corsi">
          {terms.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessun anno corsi.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {terms.map((term) => (
                <li
                  key={term.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-neutral-900">{term.label}</p>
                    <p className="text-neutral-500">
                      {formatDateItalian(term.startsOn)} –{" "}
                      {formatDateItalian(term.endsOn)}
                    </p>
                  </div>
                  {term.isCurrent ? (
                    <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Corrente
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        <LessonSubjectsForm
          subjects={subjects.map((row) => ({
            id: row.id,
            name: row.name,
            isActive: row.isActive,
          }))}
        />

        <PackPriceForm
          prices={packPrices.map((row) => ({
            id: row.id,
            courseKind: row.courseKind,
            durationMinutes: row.durationMinutes,
            amountEur: row.amountEur,
          }))}
        />

        <SchoolClosuresForm
          closures={closures.map((row) => ({
            id: row.id,
            title: row.title,
            startsOn: row.startsOn,
            endsOn: row.endsOn,
            repeatsYearly: row.repeatsYearly,
          }))}
        />
      </div>
    </div>
  );
}
