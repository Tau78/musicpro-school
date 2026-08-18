"use client";

import { useState, type ReactNode } from "react";

import { SettingsTabs } from "@/components/admin/settings-chrome";

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
    <div className="space-y-6">
      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "profilo" ? profilo : null}
      {tab === "orari" ? orari : null}
      {tab === "calendario" ? calendario : null}
    </div>
  );
}
