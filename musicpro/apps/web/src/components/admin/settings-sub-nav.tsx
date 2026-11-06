"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  AdminWorkspaceNav,
  type AdminWorkspaceNavGroup,
} from "@/components/admin/admin-workspace-nav";
import { isSettingsPath } from "@/lib/admin/settings-nav";

interface SettingsSubNavProps {
  showQuote: boolean;
  showSale: boolean;
  showShop: boolean;
  showMarket: boolean;
  showPrenotazioniSettings: boolean;
  showDocumenti: boolean;
  showUtenti: boolean;
  children: ReactNode;
}

export function SettingsSubNav({
  showQuote,
  showSale,
  showShop,
  showMarket,
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
  const onMarket = pathname.startsWith("/admin/market");
  const onUtenti = pathname.startsWith("/admin/impostazioni/utenti");
  const onDocumenti =
    pathname.startsWith("/admin/impostazioni/documenti") ||
    pathname.startsWith("/admin/template");
  const onImpostazioniRoot =
    (pathname === "/admin/impostazioni" ||
      pathname.startsWith("/admin/penali")) &&
    !onDocumenti &&
    !onUtenti;

  const groups: AdminWorkspaceNavGroup[] = [];

  const pagamentiItems = [
    showQuote
      ? { href: "/admin/quote", label: "Quote associative" }
      : null,
    showShop ? { href: "/admin/shop", label: "Crediti" } : null,
    showMarket ? { href: "/admin/market", label: "Market" } : null,
  ].filter((item): item is { href: string; label: string } => item != null);

  if (pagamentiItems.length > 0) {
    groups.push({ label: "Pagamenti", items: pagamentiItems });
  }

  const saleItems = [
    showSale ? { href: "/admin/sale", label: "Sale" } : null,
    showPrenotazioniSettings
      ? { href: "/admin/impostazioni", label: "Regole di prenotazione" }
      : null,
  ].filter((item): item is { href: string; label: string } => item != null);

  if (saleItems.length > 0) {
    groups.push({ label: "Sale e prenotazioni", items: saleItems });
  }

  const segreteriaItems = [
    showDocumenti
      ? { href: "/admin/impostazioni/documenti", label: "Documenti" }
      : null,
    showUtenti
      ? { href: "/admin/impostazioni/utenti", label: "Utenti" }
      : null,
  ].filter((item): item is { href: string; label: string } => item != null);

  if (segreteriaItems.length > 0) {
    groups.push({ label: "Segreteria", items: segreteriaItems });
  }

  if (groups.length === 0) {
    return children;
  }

  const activeHref = onUtenti
    ? "/admin/impostazioni/utenti"
    : onDocumenti
      ? "/admin/impostazioni/documenti"
      : onImpostazioniRoot
        ? "/admin/impostazioni"
        : onSale
          ? "/admin/sale"
          : onMarket
            ? "/admin/market"
            : onShop
              ? "/admin/shop"
              : onQuote
                ? "/admin/quote"
                : null;

  return (
    <div className="min-w-0 max-w-full space-y-3 sm:space-y-4">
      <AdminWorkspaceNav
        title="Impostazioni"
        groups={groups}
        activeHref={activeHref}
        segmentAriaLabel="Sezioni impostazioni"
      />
      <div className="min-w-0 max-w-full">{children}</div>
    </div>
  );
}
