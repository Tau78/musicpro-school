"use client";

import { useState } from "react";

import { formatDateItalian, type LessonSchoolSettings } from "@musicpro/database";

import { SettingsTabs } from "@/components/admin/settings-chrome";
import { CourseTermForm, type CourseTermSummary } from "@/components/lezioni/course-term-form";
import { LessonSchoolSettingsForm } from "@/components/lezioni/lesson-school-settings-form";
import {
  LessonSubjectsForm,
  type LessonSubjectFormRow,
} from "@/components/lezioni/lesson-subjects-form";
import { PackPriceForm, type PackPriceFormRow } from "@/components/lezioni/pack-price-form";
import {
  SchoolClosuresForm,
  type SchoolClosureFormRow,
} from "@/components/lezioni/school-closures-form";

type AdminLezioniSettingsTab =
  | "scuola"
  | "anno"
  | "prezzi"
  | "chiusure"
  | "materie";

const TABS: { id: AdminLezioniSettingsTab; label: string }[] = [
  { id: "scuola", label: "Scuola" },
  { id: "anno", label: "Anno" },
  { id: "prezzi", label: "Prezzi" },
  { id: "chiusure", label: "Chiusure" },
  { id: "materie", label: "Materie" },
];

export type AdminLezioniTermRow = CourseTermSummary & { isCurrent: boolean };

export function AdminLezioniSettingsPanel({
  settings,
  currentTerm,
  terms,
  packPrices,
  closures,
  subjects,
}: {
  settings: LessonSchoolSettings | null;
  currentTerm: CourseTermSummary | null;
  terms: AdminLezioniTermRow[];
  packPrices: PackPriceFormRow[];
  closures: SchoolClosureFormRow[];
  subjects: LessonSubjectFormRow[];
}) {
  const [tab, setTab] = useState<AdminLezioniSettingsTab>("scuola");

  return (
    <div className="space-y-6">
      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "scuola" ? (
        settings ? (
          <LessonSchoolSettingsForm settings={settings} />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Impostazioni scuola non trovate.
          </p>
        )
      ) : null}

      {tab === "anno" ? (
        <div className="space-y-8">
          <CourseTermForm currentTerm={currentTerm} />
          <section className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--brand)]">
              Anni corsi
            </h3>
            {terms.length === 0 ? (
              <p className="text-sm text-neutral-500">Nessun anno corsi.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                {terms.map((term) => (
                  <li
                    key={term.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
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
          </section>
        </div>
      ) : null}

      {tab === "prezzi" ? <PackPriceForm prices={packPrices} /> : null}

      {tab === "chiusure" ? <SchoolClosuresForm closures={closures} /> : null}

      {tab === "materie" ? <LessonSubjectsForm subjects={subjects} /> : null}
    </div>
  );
}
