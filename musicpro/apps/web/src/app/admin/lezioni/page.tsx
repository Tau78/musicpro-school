import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";

const SECTIONS = [
  {
    href: "/admin/lezioni/corsi",
    label: "Corsi",
    description: "Elenco, nuovo corso, dettaglio lezioni.",
    ready: true,
  },
  {
    href: "/admin/lezioni/coda",
    label: "Coda",
    description: "Da approvare, hold, da piazzare.",
    ready: true,
  },
  {
    href: "/admin/lezioni/disponibilita",
    label: "Disponibilità",
    description: "Fasce settimanali e ferie dei docenti.",
    ready: true,
  },
  {
    href: "/admin/lezioni/impostazioni",
    label: "Impostazioni",
    description: "Anno corsi (dal / al).",
    ready: true,
  },
  {
    href: "/admin/lezioni/calendario",
    label: "Calendario",
    description: "Settimana e mese — in arrivo.",
    ready: false,
  },
  {
    href: "/admin/lezioni/rette",
    label: "Rette",
    description: "Rette da incassare — in arrivo.",
    ready: false,
  },
] as const;

export default async function AdminLezioniHubPage() {
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Lezioni</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Corsi, disponibilità docenti, coda di approvazione. Calendario e
          rette arrivano nelle prossime fette.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="block rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-neutral-900">{section.label}</p>
                {section.ready ? null : (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    Stub
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-600">
                {section.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
