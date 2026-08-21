"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import {
  AdminSideNav,
  type AdminSideNavGroup,
} from "@/components/admin/admin-side-nav";
import { isSettingsPath } from "@/lib/admin/settings-nav";

interface SettingsSubNavProps {
  showQuote: boolean;
  showSale: boolean;
  showShop: boolean;
  showPrenotazioniSettings: boolean;
  showDocumenti: boolean;
  children: ReactNode;
}

export function SettingsSubNav({
  showQuote,
  showSale,
  showShop,
  showPrenotazioniSettings,
  showDocumenti,
  children,
}: SettingsSubNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!isSettingsPath(pathname)) {
    return children;
  }

  const sezione = searchParams.get("sezione");
  const onQuote = pathname.startsWith("/admin/quote");
  const onImpostazioniRoot = pathname === "/admin/impostazioni";

  const groups: AdminSideNavGroup[] = [
    {
      label: "Quote",
      items: [
        {
          href: "/admin/quote",
          label: "Importi",
          active: onQuote && sezione !== "pagamenti",
          visible: showQuote,
        },
        {
          href: "/admin/quote?sezione=pagamenti",
          label: "Pagamenti",
          active: onQuote && sezione === "pagamenti",
          visible: showQuote,
        },
      ].filter((item) => item.visible),
    },
    {
      label: "Sale",
      items: [
        {
          href: "/admin/sale",
          label: "Sale",
          active: pathname.startsWith("/admin/sale"),
          visible: showSale,
        },
      ].filter((item) => item.visible),
    },
    {
      label: "Shop",
      items: [
        {
          href: "/admin/shop",
          label: "Shop",
          active: pathname.startsWith("/admin/shop"),
          visible: showShop,
        },
      ].filter((item) => item.visible),
    },
    {
      label: "Prenotazioni",
      items: [
        {
          href: "/admin/impostazioni",
          label: "Soglie",
          active:
            onImpostazioniRoot &&
            sezione !== "penali" &&
            sezione !== "crediti" &&
            sezione !== "rimborsi",
          visible: showPrenotazioniSettings,
        },
        {
          href: "/admin/impostazioni?sezione=penali",
          label: "Penali",
          active:
            pathname.startsWith("/admin/penali") ||
            (onImpostazioniRoot && sezione === "penali"),
          visible: showPrenotazioniSettings,
        },
        {
          href: "/admin/impostazioni?sezione=crediti",
          label: "Crediti",
          active:
            onImpostazioniRoot &&
            (sezione === "crediti" || sezione === "rimborsi"),
          visible: showPrenotazioniSettings,
        },
      ].filter((item) => item.visible),
    },
    {
      label: "Documenti",
      items: [
        {
          href: "/admin/impostazioni/documenti",
          label: "Documenti",
          active: pathname === "/admin/impostazioni/documenti",
          visible: showDocumenti,
        },
        {
          href: "/admin/impostazioni/documenti/drive",
          label: "Cartelle",
          active: pathname.startsWith("/admin/impostazioni/documenti/drive"),
          visible: showDocumenti,
        },
        {
          href: "/admin/impostazioni/documenti/template",
          label: "Modelli",
          active:
            pathname.startsWith("/admin/impostazioni/documenti/template") ||
            pathname.startsWith("/admin/template"),
          visible: showDocumenti,
        },
      ].filter((item) => item.visible),
    },
  ]
    .map((group) => ({
      label: group.label,
      items: group.items.map(({ href, label, active }) => ({
        href,
        label,
        active,
      })),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return children;
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <AdminSideNav groups={groups} label="Impostazioni" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
