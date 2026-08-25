"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SettingsLinkTabs, SettingsPageHeader } from "@/components/admin/settings-page-chrome";

const DOCUMENTI_TABS = [
  { href: "/admin/impostazioni/documenti", label: "Generali" },
  { href: "/admin/impostazioni/documenti/drive", label: "Cartelle" },
  { href: "/admin/impostazioni/documenti/template", label: "Modelli" },
] as const;

export function DocumentiSettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const tabs = DOCUMENTI_TABS.map((tab) => ({
    ...tab,
    active:
      tab.href === "/admin/impostazioni/documenti"
        ? pathname === tab.href
        : pathname.startsWith(tab.href),
  }));

  return (
    <div>
      <SettingsPageHeader
        title="Documenti"
        description="Email di servizio, cartelle Google Drive e modelli dei documenti."
      />
      <SettingsLinkTabs tabs={tabs} />
      {children}
    </div>
  );
}
