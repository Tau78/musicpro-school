"use client";

import { usePathname } from "next/navigation";

import {
  LessonsWorkspaceNav,
  type LessonsNavGroup,
} from "@/components/lezioni/lessons-workspace-nav";

export type { LessonsNavGroup };

export const ADMIN_LEZIONI_NAV: readonly LessonsNavGroup[] = [
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
      { href: "/admin/lezioni/tabelloni", label: "Tabelloni" },
      { href: "/admin/lezioni/impostazioni", label: "Scuola" },
    ],
  },
] as const;

export const TEACHER_LEZIONI_NAV: readonly LessonsNavGroup[] = [
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

/** @deprecated Usa LessonsWorkspaceNav */
export function LezioniSideNav({
  groups,
}: {
  groups: readonly LessonsNavGroup[];
}) {
  const pathname = usePathname();
  const activeHref =
    groups
      .flatMap((group) => group.items)
      .filter((item) => pathname.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  void activeHref;

  return <LessonsWorkspaceNav groups={groups} title="Lezioni" />;
}
