import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OnboardingProfileSection } from "@/components/onboarding/onboarding-profile-section";
import { getMembershipStatus } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

/** Form pubblico (FTP); evita GET su /api/iscrizione che restituisce solo JSON. */
const DEFAULT_ENROLLMENT_FORM_URL = "https://iscrizione.musicproeventi.it/";

function enrollmentFormHref(): string {
  return (
    process.env.NEXT_PUBLIC_ENROLLMENT_FORM_URL?.trim() ||
    DEFAULT_ENROLLMENT_FORM_URL
  );
}

export default async function OnboardingFormPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?redirect=/onboarding/form");
  }

  const status = await getMembershipStatus(supabase, member.id);

  if (status.formCompleted && status.quotaPaid) {
    redirect("/dashboard");
  }

  if (status.formCompleted) {
    redirect("/onboarding/quota");
  }

  // Quota già pagata ma modulo formale ancora incompleto: non lasciare stato silenzioso.
  if (status.quotaPaid && !status.formCompleted) {
    return (
      <main className="min-h-screen">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--brand-accent)]">
                {APP_NAME}
              </p>
              <h1 className="text-xl font-semibold text-[var(--brand)]">
                Modulo iscrizione
              </h1>
            </div>
            <SignOutButton />
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-6 py-8">
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-medium text-amber-950">
              Quota pagata — completa il modulo
            </h2>
            <p className="mt-2 text-sm text-amber-900">
              La quota associativa {status.fiscalYear} risulta versata, ma il
              modulo iscrizione (anagrafica/consensi) non è ancora allineato al
              tuo profilo. Completa il modulo per sbloccare la dashboard.
            </p>
            <p className="mt-4 text-sm text-amber-900/90">
              Usa la stessa email dell&apos;account ({member.email ?? "login"}).
              Fino al modulo allineato, dashboard e prenotazioni restano
              bloccate — non è un errore del telefono.
            </p>
            <div className="mt-6">
              <a
                href={enrollmentFormHref()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-lg border border-amber-400 bg-white px-5 py-2.5 text-sm font-medium text-amber-950 hover:bg-amber-100/60"
              >
                Modulo completo (firma PDF)
              </a>
            </div>
          </section>

          <OnboardingProfileSection
            supabase={supabase}
            memberId={member.id}
            firstName={member.firstName}
            lastName={member.lastName}
          />
        </div>
      </main>
    );
  }

  const formHref = enrollmentFormHref();
  const canSkipToQuota = status.canPayQuota;

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Modulo iscrizione
            </h1>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Completa la tua iscrizione
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Per accedere alla dashboard, alle prenotazioni e alle band devi
            compilare il modulo di iscrizione associativa.
          </p>

          <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-700">
            <p>
              Il modulo raccoglie anagrafica, consensi e firma digitale. Dopo
              l&apos;invio potrai procedere al versamento della quota
              associativa.
            </p>
            {canSkipToQuota ? (
              <p className="mt-3 text-neutral-600">
                Sul tuo profilo risultano già nome e contatti: puoi versare la
                quota ora; il ruolo associato verrà allineato al pagamento. Il
                modulo formale resta consigliato se non l&apos;hai ancora inviato.
              </p>
            ) : (
              <p className="mt-3 text-amber-900">
                Anagrafica incompleta sul profilo: completa il modulo prima di
                pagare. Il link esterno non è collegato automaticamente al tuo
                account — dopo l&apos;invio torna qui o vai alla quota.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={formHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Modulo completo (firma PDF)
            </a>
            {canSkipToQuota ? (
              <Link
                href="/onboarding/quota"
                className="inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
              >
                Vai al pagamento quota
              </Link>
            ) : null}
          </div>
        </section>

        <OnboardingProfileSection
          supabase={supabase}
          memberId={member.id}
          firstName={member.firstName}
          lastName={member.lastName}
        />
      </div>
    </main>
  );
}
