"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { AdminSideNav } from "@/components/admin/admin-side-nav";

export type PrenotazioniLista = "da-approvare" | "prossime" | "tutte";

export function parsePrenotazioniLista(
  value: string | undefined | null,
): PrenotazioniLista {
  if (value === "prossime" || value === "tutte") return value;
  return "da-approvare";
}

export function PrenotazioniSideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onCalendar = pathname === "/admin/prenotazioni/calendario";
  const onList = pathname === "/admin/prenotazioni/lista";
  const lista = parsePrenotazioniLista(searchParams.get("lista"));

  return (
    <AdminSideNav
      label="Prenotazioni"
      groups={[
        {
          label: "Prove",
          items: [
            {
              href: "/admin/prenotazioni/calendario",
              label: "Calendario",
              active: onCalendar,
            },
            {
              href: "/admin/prenotazioni/lista",
              label: "Da approvare",
              active: onList && lista === "da-approvare",
            },
            {
              href: "/admin/prenotazioni/lista?lista=prossime",
              label: "Prossime",
              active: onList && lista === "prossime",
            },
            {
              href: "/admin/prenotazioni/lista?lista=tutte",
              label: "Tutte",
              active: onList && lista === "tutte",
            },
          ],
        },
      ]}
    />
  );
}
