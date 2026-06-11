import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import {
  APP_NAME,
  MEMBER_ROLE_LABELS,
  MemberRole,
  type MemberRoleValue,
} from "@musicpro/shared";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { canAccessAdmin } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const assignedRoles = new Set(member.roles);
  const showAdminLink = canAccessAdmin(member.roles);

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
          <SignOutButton />
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

        {showAdminLink ? (
          <section className="mt-8">
            <h2 className="text-lg font-medium text-[var(--brand)]">
              Amministrazione
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Gestisci anagrafiche e rimborsi dal pannello admin.
            </p>
            <Link
              href="/admin"
              className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Vai al pannello admin
            </Link>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Tutti i ruoli (riferimento)
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(MemberRole).map((role) => {
              const isAssigned = assignedRoles.has(role as MemberRoleValue);

              return (
                <li
                  key={role}
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    isAssigned
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <span className="font-medium">
                    {MEMBER_ROLE_LABELS[role]}
                  </span>
                  <span className="mt-1 block text-neutral-500">{role}</span>
                  {isAssigned ? (
                    <span className="mt-2 block text-xs font-medium text-[var(--brand)]">
                      Assegnato
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
