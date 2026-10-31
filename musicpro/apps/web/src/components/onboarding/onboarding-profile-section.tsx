import { getMemberById, type Database } from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import { OnboardingAnagraficaForm } from "@/components/onboarding/onboarding-anagrafica-form";
import type { ProfileSettingsInitial } from "@/components/dashboard/profile-settings-form";

type ServerClient = SupabaseClient<Database>;

function toProfileInitial(
  memberId: string,
  detail: Awaited<ReturnType<typeof getMemberById>>,
  fallback: { firstName: string; lastName: string },
): ProfileSettingsInitial {
  return {
    memberId,
    firstName: detail?.firstName ?? fallback.firstName,
    lastName: detail?.lastName ?? fallback.lastName,
    phone: detail?.phone ?? null,
    addressStreet: detail?.addressStreet ?? null,
    addressPostalCode: detail?.addressPostalCode ?? null,
    addressCity: detail?.addressCity ?? null,
    addressProvince: detail?.addressProvince ?? null,
    birthDate: detail?.birthDate ?? null,
    birthPlace: detail?.birthPlace ?? null,
    birthProvince: detail?.birthProvince ?? null,
    taxCode: detail?.taxCode ?? null,
  };
}

export async function OnboardingProfileSection({
  supabase,
  memberId,
  firstName,
  lastName,
  showPdfLink = false,
  pdfHref,
}: {
  supabase: ServerClient;
  memberId: string;
  firstName: string;
  lastName: string;
  showPdfLink?: boolean;
  pdfHref?: string;
}) {
  const detail = await getMemberById(supabase, memberId);
  const requireGdprConsent = Boolean(
    detail && !detail.gdprConsent && !detail.enrolledAt,
  );
  const requireTaxCode = !String(detail?.taxCode ?? "").trim();

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-[var(--brand)]">
        Per proseguire, abbiamo bisogno di completare la tua anagrafica.
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Compila i campi sotto (solo quelli ancora mancanti). Controlliamo formato
        e coerenza prima del salvataggio.
      </p>
      <OnboardingAnagraficaForm
        initial={toProfileInitial(memberId, detail, { firstName, lastName })}
        requireTaxCode={requireTaxCode}
        requireGdprConsent={requireGdprConsent}
      />
      {showPdfLink && pdfHref ? (
        <p className="mt-6 border-t border-neutral-100 pt-4 text-sm text-neutral-600">
          Serve anche il modulo con firma digitale?{" "}
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
          >
            Modulo completo (PDF)
          </a>
        </p>
      ) : null}
    </section>
  );
}
