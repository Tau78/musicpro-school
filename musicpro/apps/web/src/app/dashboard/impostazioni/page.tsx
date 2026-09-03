import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getMemberById,
  listReimbursements,
} from "@musicpro/database";
import {
  APP_NAME,
  MEMBER_ROLE_LABELS,
  MemberRole,
} from "@musicpro/shared";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { DeleteAccountButton } from "@/components/auth/delete-account-button";
import { PasskeySettings } from "@/components/auth/passkey-settings";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { MailingOptInToggle } from "@/components/dashboard/mailing-opt-in-toggle";
import { MyReimbursements } from "@/components/dashboard/my-reimbursements";
import { ProfileSettingsForm } from "@/components/dashboard/profile-settings-form";
import { canAccessAdmin } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

const PRIVACY_URL = "https://www.musicproeventi.it/privacy";

export default async function DashboardImpostazioniPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const [profile, myReimbursements] = await Promise.all([
    getMemberById(supabase, member.id),
    listReimbursements(supabase, { memberId: member.id }),
  ]);

  const showAdminLink = canAccessAdmin(member.roles);
  const detail = profile ?? null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Impostazioni
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-neutral-600 hover:text-[var(--brand)]"
            >
              Dashboard
            </Link>
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
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">Profilo</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
            <h3 className="text-sm font-medium text-neutral-800">
              Dati personali
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Aggiorna i dati anagrafici usati dalla segreteria.
            </p>
            <ProfileSettingsForm
              initial={{
                memberId: member.id,
                firstName: detail?.firstName ?? member.firstName,
                lastName: detail?.lastName ?? member.lastName,
                phone: detail?.phone ?? null,
                addressStreet: detail?.addressStreet ?? null,
                addressPostalCode: detail?.addressPostalCode ?? null,
                addressCity: detail?.addressCity ?? null,
                addressProvince: detail?.addressProvince ?? null,
                birthDate: detail?.birthDate ?? null,
                birthPlace: detail?.birthPlace ?? null,
                birthProvince: detail?.birthProvince ?? null,
                taxCode: detail?.taxCode ?? null,
              }}
            />
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-medium text-neutral-800">Privacy</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Informativa sul trattamento dei dati personali.
            </p>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
            >
              Apri informativa privacy
            </a>
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-5">
            <MailingOptInToggle
              memberId={member.id}
              initialOptIn={detail?.mailingOptIn ?? true}
            />
          </div>

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
          <DeleteAccountButton />
        </section>

        <section>
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

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Le mie notule
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Firma le notule di rimborso spese per confermare la ricezione.
          </p>
          <MyReimbursements initialRows={myReimbursements.reimbursements} />
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
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

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
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

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">Account</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Esci dall&apos;area riservata di {APP_NAME} o cambia utente: la
            sessione viene chiusa e torni al login.
          </p>
          <div className="mt-4">
            <SignOutButton
              label="Esci / Cambia utente"
              loadingLabel="Uscita…"
              className="inline-flex rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
