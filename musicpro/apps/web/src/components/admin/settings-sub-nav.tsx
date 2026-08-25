"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  AdminGroupedNav,
  type AdminNavGroup,
} from "@/components/admin/admin-grouped-nav";
import { isSettingsPath } from "@/lib/admin/settings-nav";

interface SettingsSubNavProps {
  showQuote: boolean;
  showSale: boolean;
  showShop: boolean;
  showPrenotazioniSettings: boolean;
  showDocumenti: boolean;
  showUtenti: boolean;
  children: ReactNode;
}

export function SettingsSubNav({
  showQuote,
  showSale,
  showShop,
  showPrenotazioniSettings,
  showDocumenti,
  showUtenti,
  children,
}: SettingsSubNavProps) {
  const pathname = usePathname();

  if (!isSettingsPath(pathname)) {
    return children;
  }

  const onQuote = pathname.startsWith("/admin/quote");
  const onSale = pathname.startsWith("/admin/sale");
  const onShop = pathname.startsWith("/admin/shop");
  const onImpostazioniRoot =
    pathname === "/admin/impostazioni" || pathname.startsWith("/admin/penali");
  const onDocumenti =
    pathname.startsWith("/admin/impostazioni/documenti") ||
    pathname.startsWith("/admin/template");
  const onUtenti = pathname.startsWith("/admin/impostazioni/utenti");

  const groups: AdminNavGroup[] = [];

  const pagamentiItems = [
    {
      href: "/admin/quote",
      label: "Quote associative",
      description: "Importi annuali e pagamenti",
      active: onQuote,
      visible: showQuote,
    },
    {
      href: "/admin/shop",
      label: "Shop crediti",
      description: "Pacchetti e storico acquisti",
      active: onShop,
      visible: showShop,
    },
  ].filter((item) => item.visible);

  if (pagamentiItems.length > 0) {
    groups.push({
      label: "Pagamenti",
      items: pagamentiItems.map(({ href, label, description, active }) => ({
        href,
        label,
        description,
        active,
      })),
    });
  }

  const saleItems = [
    {
      href: "/admin/sale",
      label: "Sale",
      description: "Orari, tariffe e calendari",
      active: onSale,
      visible: showSale,
    },
    {
      href: "/admin/impostazioni",
      label: "Regole di prenotazione",
      description: "Soglie, penali e crediti",
      active: onImpostazioniRoot,
      visible: showPrenotazioniSettings,
    },
  ].filter((item) => item.visible);

  if (saleItems.length > 0) {
    groups.push({
      label: "Sale e prenotazioni",
      items: saleItems.map(({ href, label, description, active }) => ({
        href,
        label,
        description,
        active,
      })),
    });
  }

  const segreteriaItems = [
    {
      href: "/admin/impostazioni/documenti",
      label: "Documenti",
      description: "Email, Drive e modelli",
      active: onDocumenti,
      visible: showDocumenti,
    },
    {
      href: "/admin/impostazioni/utenti",
      label: "Utenti",
      description: "Accesso amministrazione",
      active: onUtenti,
      visible: showUtenti,
    },
  ].filter((item) => item.visible);

  if (segreteriaItems.length > 0) {
    groups.push({
      label: "Segreteria",
      items: segreteriaItems.map(({ href, label, description, active }) => ({
        href,
        label,
        description,
        active,
      })),
    });
  }

  if (groups.length === 0) {
    return children;
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <div className="md:sticky md:top-4 md:self-start">
        <AdminGroupedNav groups={groups} label="Impostazioni" title="Impostazioni" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
