"use client";

import { usePathname } from "next/navigation";

import { AdminPillNav } from "@/components/admin/admin-pill-nav";

const ITEMS = [
  { href: "/lezioni/calendario", label: "Calendario" },
  { href: "/lezioni/oggi", label: "Oggi" },
  { href: "/lezioni/corsi", label: "Corsi" },
  { href: "/lezioni/notule", label: "Notule" },
  { href: "/lezioni/impostazioni", label: "Impostazioni" },
] as const;

export function LezioniSubNav() {
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
