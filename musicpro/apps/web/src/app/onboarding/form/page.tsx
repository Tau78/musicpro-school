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
  const pdfHref = enrollmentFormHref();

  if (status.formCompleted && status.quotaPaid) {
    redirect("/dashboard");
  }

  if (status.formCompleted) {
    redirect("/onboarding/quota");
  }

  if (status.quotaPaid && !status.formCompleted) {
    return (
      <main className="min-h-screen">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex min-w-0 max-w-3xl items-center justify-between px-6 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--brand-accent)]">
                {APP_NAME}
              </p>
              <h1 className="truncate text-xl font-semibold text-[var(--brand)]">
                Anagrafica
              </h1>
            </div>
            <SignOutButton />
          </div>
        </header>

        <div className="mx-auto max-w-3xl min-w-0 px-6 py-8">
          {status.quotaPaid ? (
            <p className="mb-4 text-sm text-amber-900">
              Quota associativa {status.fiscalYear} già versata: completa
              l&apos;anagrafica per sbloccare dashboard e prenotazioni.
            </p>
          ) : null}
          <OnboardingProfileSection
            supabase={supabase}
            memberId={member.id}
            firstName={member.firstName}
            lastName={member.lastName}
            showPdfLink
            pdfHref={pdfHref}
          />
        </div>
      </main>
    );
  }

  const canSkipToQuota = status.canPayQuota;

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl min-w-0 max-w-full items-center justify-between px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="truncate text-xl font-semibold text-[var(--brand)]">
              Anagrafica
            </h1>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl min-w-0 px-6 py-8 space-y-6">
        <OnboardingProfileSection
          supabase={supabase}
          memberId={member.id}
          firstName={member.firstName}
          lastName={member.lastName}
          showPdfLink
          pdfHref={pdfHref}
        />

        {canSkipToQuota ? (
          <div className="flex min-w-0 max-w-full flex-wrap gap-3">
            <Link
              href="/onboarding/quota"
              className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Vai al pagamento quota
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
