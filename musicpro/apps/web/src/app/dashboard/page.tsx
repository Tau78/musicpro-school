import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listReimbursements,
} from "@musicpro/database";
import {
  APP_NAME,
  MEMBER_ROLE_LABELS,
  MemberRole,
} from "@musicpro/shared";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { PasskeySettings } from "@/components/auth/passkey-settings";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { MyReimbursements } from "@/components/dashboard/my-reimbursements";
import { canAccessAdmin } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const showAdminLink = canAccessAdmin(member.roles);
  const myReimbursements = await listReimbursements(supabase, {
    memberId: member.id,
  });

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {member.roles.includes(MemberRole.Docente) ? (
              <Link
                href="/lezioni"
                className="text-sm text-neutral-600 hover:text-[var(--brand)]"
              >
                Lezioni
              </Link>
            ) : null}
            {showAdminLink ? (
              <Link
                href="/admin"
                className="text-sm text-neutral-600 hover:text-[var(--brand)]"
              >
                Admin
              </Link>
            ) : null}
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">Profilo</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Nome</dt>
              <dd className="font-medium text-neutral-900">
                {member.firstName} {member.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Email</dt>
              <dd className="font-medium text-neutral-900">
                {member.email ?? "—"}
              </dd>
            </div>
            {member.memberNumber ? (
              <div>
                <dt className="text-neutral-500">N. associato</dt>
                <dd className="font-medium text-neutral-900">
                  {member.memberNumber}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-medium text-neutral-800">Password</h3>
            <div className="mt-3">
              <ChangePasswordForm />
            </div>
          </div>
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-medium text-neutral-800">Passkey</h3>
            <div className="mt-3">
              <PasskeySettings />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-[var(--brand)]">I tuoi ruoli</h2>
          {member.roles.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {member.roles.map((role) => (
                <li
                  key={role}
                  className="rounded-full bg-[var(--brand)]/10 px-3 py-1 text-sm font-medium text-[var(--brand)]"
                >
                  {MEMBER_ROLE_LABELS[role as MemberRole]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-neutral-600">
              Nessun ruolo assegnato. Contatta la segreteria.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Le mie notule
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Firma le notule di rimborso spese per confermare la ricezione.
          </p>
          <MyReimbursements initialRows={myReimbursements.reimbursements} />
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Le mie band
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Crea o gestisci le band a cui appartieni, invita nuovi membri e
            preparati alle prenotazioni di gruppo.
          </p>
          <Link
            href="/dashboard/band"
            className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Vai alle band
          </Link>
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Shop crediti
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Acquista pacchetti crediti per le prenotazioni sale prova.
          </p>
          <Link
            href="/dashboard/shop"
            className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Vai allo shop
          </Link>
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Sale prova
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Prenota una sala, consulta le tue prenotazioni o annulla entro i
            termini previsti — tutto dall&apos;area riservata, senza email.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/prenotazioni"
              className="inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Prenota una sala
            </Link>
            <Link
              href="/prenotazioni/mie"
              className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Le mie prenotazioni
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
