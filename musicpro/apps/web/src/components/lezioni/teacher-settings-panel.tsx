"use client";

import { useState, type ReactNode } from "react";

import { SettingsSideNav } from "@/components/admin/settings-chrome";

type TeacherSettingsTab = "profilo" | "orari" | "calendario";

const TABS: { id: TeacherSettingsTab; label: string }[] = [
  { id: "profilo", label: "Profilo" },
  { id: "orari", label: "Orari" },
  { id: "calendario", label: "Calendario" },
];

export function TeacherSettingsPanel({
  profilo,
  orari,
  calendario,
}: {
  profilo: ReactNode;
  orari: ReactNode;
  calendario: ReactNode;
}) {
  const [tab, setTab] = useState<TeacherSettingsTab>("profilo");

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <SettingsSideNav tabs={TABS} value={tab} onChange={setTab} label="Scuola" />
      <div className="min-w-0 flex-1">
        {tab === "profilo" ? profilo : null}
        {tab === "orari" ? orari : null}
        {tab === "calendario" ? calendario : null}
      </div>
    </div>
  );
}
