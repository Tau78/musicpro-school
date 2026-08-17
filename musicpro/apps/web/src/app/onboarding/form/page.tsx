import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { getMembershipStatus } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

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

  const externalFormUrl = process.env.NEXT_PUBLIC_ENROLLMENT_FORM_URL?.trim();
  const formHref = externalFormUrl || "/api/iscrizione";

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
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={formHref}
              target={externalFormUrl ? "_blank" : undefined}
              rel={externalFormUrl ? "noopener noreferrer" : undefined}
              className="inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Apri modulo iscrizione
            </a>
            <Link
              href="/onboarding/quota"
              className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Ho già compilato il modulo
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
