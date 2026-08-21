"use client";

import { usePathname } from "next/navigation";

import {
  AdminSideNav,
  type AdminSideNavGroup,
} from "@/components/admin/admin-side-nav";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; items: readonly NavItem[] };

export const ADMIN_LEZIONI_NAV: readonly NavGroup[] = [
  {
    label: "Giorno",
    items: [
      { href: "/admin/lezioni/oggi", label: "Oggi" },
      { href: "/admin/lezioni/calendario", label: "Calendario" },
    ],
  },
  {
    label: "Corsi",
    items: [
      { href: "/admin/lezioni/corsi", label: "Corsi" },
      { href: "/admin/lezioni/coda", label: "Da fare" },
    ],
  },
  {
    label: "Soldi",
    items: [
      { href: "/admin/lezioni/rette", label: "Rette" },
      { href: "/admin/lezioni/ricevute", label: "Ricevute" },
      { href: "/admin/lezioni/notule", label: "Notule" },
    ],
  },
  {
    label: "Scuola",
    items: [
      { href: "/admin/lezioni/disponibilita", label: "Orari" },
      { href: "/admin/lezioni/impostazioni", label: "Scuola" },
    ],
  },
] as const;

export const TEACHER_LEZIONI_NAV: readonly NavGroup[] = [
  {
    label: "Giorno",
    items: [
      { href: "/lezioni/oggi", label: "Oggi" },
      { href: "/lezioni/calendario", label: "Calendario" },
    ],
  },
  {
    label: "Corsi",
    items: [{ href: "/lezioni/corsi", label: "Corsi" }],
  },
  {
    label: "Soldi",
    items: [{ href: "/lezioni/notule", label: "Notule" }],
  },
  {
    label: "Scuola",
    items: [{ href: "/lezioni/impostazioni", label: "Scuola" }],
  },
] as const;

export function LezioniSideNav({
  groups,
}: {
  groups: readonly NavGroup[];
}) {
  const pathname = usePathname();
  const activeHref =
    groups
      .flatMap((group) => group.items)
      .filter((item) => pathname.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  const resolved: AdminSideNavGroup[] = groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      ...item,
      active: item.href === activeHref,
    })),
  }));

  return <AdminSideNav groups={resolved} label="Lezioni" />;
}
