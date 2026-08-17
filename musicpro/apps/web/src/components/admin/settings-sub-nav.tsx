"use client";

import { usePathname } from "next/navigation";

import { isSettingsPath } from "@/lib/admin/settings-nav";

import { AdminPillNav } from "./admin-pill-nav";

interface SettingsSubNavProps {
  showQuote: boolean;
  showSale: boolean;
  showShop: boolean;
  showPrenotazioniSettings: boolean;
  showDocumenti: boolean;
}

export function SettingsSubNav({
  showQuote,
  showSale,
  showShop,
  showPrenotazioniSettings,
  showDocumenti,
}: SettingsSubNavProps) {
  const pathname = usePathname();

  if (!isSettingsPath(pathname)) {
    return null;
  }

  const items = [
    {
      href: "/admin/quote",
      label: "Quote",
      active: pathname.startsWith("/admin/quote"),
      visible: showQuote,
    },
    {
      href: "/admin/sale",
      label: "Sale",
      active: pathname.startsWith("/admin/sale"),
      visible: showSale,
    },
    {
      href: "/admin/shop",
      label: "Shop",
      active: pathname.startsWith("/admin/shop"),
      visible: showShop,
    },
    {
      href: "/admin/impostazioni",
      label: "Prenotazioni",
      active:
        pathname === "/admin/impostazioni" ||
        pathname.startsWith("/admin/penali"),
      visible: showPrenotazioniSettings,
    },
    {
      href: "/admin/impostazioni/documenti",
      label: "Documenti",
      active:
        pathname.startsWith("/admin/impostazioni/documenti") ||
        pathname.startsWith("/admin/template"),
      visible: showDocumenti,
    },
  ].filter((item) => item.visible);

  if (items.length === 0) {
    return null;
  }

  return <AdminPillNav items={items} />;
}
