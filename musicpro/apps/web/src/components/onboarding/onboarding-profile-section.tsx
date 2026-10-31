import { getMemberById, type Database } from "@musicpro/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ProfileSettingsForm,
  type ProfileSettingsInitial,
} from "@/components/dashboard/profile-settings-form";

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
}: {
  supabase: ServerClient;
  memberId: string;
  firstName: string;
  lastName: string;
}) {
  const detail = await getMemberById(supabase, memberId);
  const requireGdprConsent = Boolean(
    detail && !detail.gdprConsent && !detail.enrolledAt,
  );

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-[var(--brand)]">
        Completa i dati qui
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Salva anagrafica e codice fiscale sul tuo profilo School. Per firma
        digitale e PDF completo resta disponibile il modulo esterno sotto.
      </p>
      <ProfileSettingsForm
        initial={toProfileInitial(memberId, detail, { firstName, lastName })}
        requireTaxCode
        requireGdprConsent={requireGdprConsent}
        submitLabel="Salva e continua"
      />
    </section>
  );
}
