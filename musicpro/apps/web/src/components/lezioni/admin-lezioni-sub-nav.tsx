"use client";

import { usePathname } from "next/navigation";

import { AdminPillNav } from "@/components/admin/admin-pill-nav";

const ITEMS = [
  { href: "/admin/lezioni/oggi", label: "Oggi" },
  { href: "/admin/lezioni/corsi", label: "Corsi" },
  { href: "/admin/lezioni/coda", label: "Coda" },
  { href: "/admin/lezioni/disponibilita", label: "Disponibilità" },
  { href: "/admin/lezioni/calendario", label: "Calendario" },
  { href: "/admin/lezioni/rette", label: "Rette" },
  { href: "/admin/lezioni/impostazioni", label: "Impostazioni" },
] as const;

export function AdminLezioniSubNav() {
  const pathname = usePathname();

  return (
    <AdminPillNav
      items={ITEMS.map((item) => ({
        href: item.href,
        label: item.label,
        active: pathname.startsWith(item.href),
      }))}
    />
  );
}
