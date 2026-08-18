import { redirect } from "next/navigation";

import {
  formatDateItalian,
  listCoursePackPrices,
  listSchoolClosures,
  listSchoolCourseTerms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseTermForm } from "@/components/lezioni/course-term-form";
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

  const [terms, packPrices, closures] = await Promise.all([
    listSchoolCourseTerms(supabase),
    listCoursePackPrices(supabase),
    listSchoolClosures(supabase),
  ]);
  const currentTerm = terms.find((term) => term.isCurrent) ?? null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Impostazioni
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Anno corsi, listino pacchetti e festività.
        </p>
      </div>

      <div className="space-y-8">
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

        <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Anni corsi
          </legend>
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
        </fieldset>

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
