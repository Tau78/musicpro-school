"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type BookingSettings,
  type CancellationPenaltyRule,
  type LastMinuteCampaign,
  type OperationalWeekSchedule,
} from "@musicpro/database";

import { BookingSettingsForm } from "@/components/admin/booking-settings-form";
import { CalendarExportBar } from "@/components/admin/calendar-export-bar";
import { PenaltyRulesPanel } from "@/components/admin/penalty-rules-panel";
import {
  SettingsPageHeader,
  SettingsPanel,
  SettingsSectionTabs,
} from "@/components/admin/settings-page-chrome";

export type PrenotazioniSettingsSection = "soglie" | "penali" | "crediti";

const PRENOTAZIONI_TABS: { id: PrenotazioniSettingsSection; label: string }[] =
  [
    { id: "soglie", label: "Soglie" },
    { id: "penali", label: "Penali" },
    { id: "crediti", label: "Crediti (riepilogo)" },
  ];

function sectionHref(section: PrenotazioniSettingsSection): string {
  return section === "soglie"
    ? "/admin/impostazioni"
    : `/admin/impostazioni?sezione=${section}`;
}

export function PrenotazioniSettingsWorkspace({
  initialSection,
  settings,
  operationalSchedule,
  recentLastMinuteCampaigns,
  rules,
  exportRooms = [],
  exportDefaultFrom,
  exportDefaultTo,
}: {
  initialSection: PrenotazioniSettingsSection;
  settings: BookingSettings;
  operationalSchedule: OperationalWeekSchedule;
  recentLastMinuteCampaigns: LastMinuteCampaign[];
  rules: CancellationPenaltyRule[];
  exportRooms?: { id: string; name: string }[];
  exportDefaultFrom?: string;
  exportDefaultTo?: string;
}) {
  const [section, setSection] = useState(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  function selectSection(next: PrenotazioniSettingsSection) {
    setSection(next);
    window.history.replaceState(null, "", sectionHref(next));
  }

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <SettingsPageHeader
        title="Regole di prenotazione"
        description="Quanto prima si può prenotare o disdire, e cosa succede in caso di annullamento."
      />
      <SettingsSectionTabs
        tabs={PRENOTAZIONI_TABS}
        value={section}
        onChange={selectSection}
      />

      {section === "soglie" ? (
        <SettingsPanel className="p-4">
          <BookingSettingsForm
            settings={settings}
            operationalSchedule={operationalSchedule}
            recentLastMinuteCampaigns={recentLastMinuteCampaigns}
          />
        </SettingsPanel>
      ) : null}

      {section === "penali" ? <PenaltyRulesPanel rules={rules} /> : null}

      {section === "crediti" ? (
        <CreditiPrenotazioniSection rules={rules} />
      ) : null}

      {exportDefaultFrom && exportDefaultTo ? (
        <CalendarExportBar
          rooms={exportRooms}
          defaultFrom={exportDefaultFrom}
          defaultTo={exportDefaultTo}
        />
      ) : null}
    </div>
  );
}

function CreditiPrenotazioniSection({
  rules,
}: {
  rules: CancellationPenaltyRule[];
}) {
  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <p className="border-b border-neutral-200 px-4 py-3 text-sm text-neutral-600">
        Crediti = complemento della penale —{" "}
        <Link
          href="/admin/impostazioni?sezione=penali"
          className="text-[var(--brand)] hover:underline"
        >
          Penali
        </Link>
        {" · "}
        <Link
          href="/admin/rimborsi"
          className="text-[var(--brand)] hover:underline"
        >
          Rimborsi
        </Link>
      </p>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Ore prima
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Penale
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Crediti
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Stato
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rules.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-neutral-500"
                >
                  Nessuna fascia. Aggiungi regole in Penali.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-900">
                    Da {rule.fromHours}h a {rule.toHours}h
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {rule.penaltyPercent}%
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {Math.max(0, 100 - rule.penaltyPercent)}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        rule.enabled ? "text-green-700" : "text-neutral-400"
                      }
                    >
                      {rule.enabled ? "Attiva" : "Disattivata"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
