"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { updateOwnProfile } from "@musicpro/database";

import {
  listMissingAnagraficaFields,
  validateProfileAnagrafica,
  type ProfileAnagraficaInput,
} from "@/lib/member-anagrafica-validation";
import { createClient } from "@/lib/supabase/client";

import type { ProfileSettingsInitial } from "@/components/dashboard/profile-settings-form";

const inputClass =
  "mt-1 w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

const PRIVACY_URL = "https://www.musicproeventi.it/privacy";

const FIELD_LABELS: Record<keyof ProfileAnagraficaInput, string> = {
  firstName: "Nome",
  lastName: "Cognome",
  taxCode: "Codice fiscale",
  phone: "Telefono",
  addressStreet: "Indirizzo",
  addressPostalCode: "CAP",
  addressCity: "Città",
  addressProvince: "Provincia",
  birthDate: "Data di nascita",
  birthPlace: "Luogo di nascita",
  birthProvince: "Provincia di nascita",
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toInput(initial: ProfileSettingsInitial): ProfileAnagraficaInput {
  return {
    firstName: initial.firstName,
    lastName: initial.lastName,
    taxCode: initial.taxCode ?? "",
    phone: initial.phone ?? "",
    addressStreet: initial.addressStreet ?? "",
    addressPostalCode: initial.addressPostalCode ?? "",
    addressCity: initial.addressCity ?? "",
    addressProvince: initial.addressProvince ?? "",
    birthDate: toDateInput(initial.birthDate),
    birthPlace: initial.birthPlace ?? "",
    birthProvince: initial.birthProvince ?? "",
  };
}

export function OnboardingAnagraficaForm({
  initial,
  requireTaxCode,
  requireGdprConsent,
}: {
  initial: ProfileSettingsInitial;
  requireTaxCode: boolean;
  requireGdprConsent: boolean;
}) {
  const router = useRouter();
  const base = useMemo(() => toInput(initial), [initial]);
  const missingKeys = useMemo(
    () => listMissingAnagraficaFields(base, requireTaxCode),
    [base, requireTaxCode],
  );
  const visibleKeys = useMemo(() => {
    const keys = new Set(missingKeys);
    keys.add("firstName");
    keys.add("lastName");
    return keys;
  }, [missingKeys]);

  const [values, setValues] = useState(base);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function setField<K extends keyof ProfileAnagraficaInput>(
    key: K,
    value: ProfileAnagraficaInput[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateProfileAnagrafica(values, {
      requireTaxCode,
      fieldsPresent: visibleKeys,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    if (requireGdprConsent && !gdprAccepted) {
      setError("Accetta l’informativa privacy per continuare.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const result = await updateOwnProfile(supabase, initial.memberId, {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phone: values.phone.trim() || null,
      addressStreet: values.addressStreet.trim() || null,
      addressPostalCode: values.addressPostalCode.trim() || null,
      addressCity: values.addressCity.trim() || null,
      addressProvince: values.addressProvince.trim().toUpperCase() || null,
      birthDate: values.birthDate || null,
      birthPlace: values.birthPlace.trim() || null,
      birthProvince: values.birthProvince.trim().toUpperCase() || null,
      taxCode: values.taxCode.trim().toUpperCase() || null,
      ...(requireGdprConsent ? { gdprConsent: gdprAccepted } : {}),
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Salvataggio non riuscito.");
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  if (success) {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-medium text-green-950">Grazie!</h2>
        <p className="mt-2 text-sm text-green-900">
          Ti consigliamo comunque di fare un giro nel tuo profilo per controllare
          che sia tutto aggiornato.
        </p>
        <div className="mt-6 flex min-w-0 max-w-full flex-wrap gap-3">
          <Link
            href="/dashboard/impostazioni"
            className="inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Apri il profilo
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex rounded-lg border border-green-300 bg-white px-5 py-2.5 text-sm font-medium text-green-950 hover:bg-green-100/60"
          >
            Continua
          </Link>
        </div>
      </section>
    );
  }

  const renderField = (key: keyof ProfileAnagraficaInput) => {
    if (!visibleKeys.has(key)) return null;
    const id = `onboarding-${key}`;
    const label = FIELD_LABELS[key];
    const common = {
      id,
      name: key,
      className: inputClass,
    };

    if (key === "birthDate") {
      return (
        <div key={key}>
          <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
            {label}
          </label>
          <input
            {...common}
            type="date"
            value={values.birthDate}
            onChange={(e) => setField("birthDate", e.target.value)}
          />
        </div>
      );
    }

    const upper =
      key === "taxCode" ||
      key === "addressProvince" ||
      key === "birthProvince";

    return (
      <div key={key} className={key === "addressStreet" ? "sm:col-span-2" : undefined}>
        <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
          {label}
          {key === "taxCode" && requireTaxCode ? (
            <span className="text-red-600"> *</span>
          ) : null}
        </label>
        <input
          {...common}
          type={key === "phone" ? "tel" : "text"}
          required={key === "taxCode" && requireTaxCode}
          value={values[key]}
          maxLength={key === "addressProvince" || key === "birthProvince" ? 2 : undefined}
          onChange={(e) =>
            setField(key, upper ? e.target.value.toUpperCase() : e.target.value)
          }
        />
      </div>
    );
  };

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(FIELD_LABELS) as (keyof ProfileAnagraficaInput)[]).map(
          renderField,
        )}
      </div>

      {requireGdprConsent ? (
        <label className="flex min-w-0 max-w-full cursor-pointer items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0"
            checked={gdprAccepted}
            onChange={(e) => setGdprAccepted(e.target.checked)}
          />
          <span>
            Ho letto l&apos;{" "}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
            >
              informativa privacy
            </a>{" "}
            e acconsento al trattamento dei dati per l&apos;iscrizione
            associativa.
          </span>
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {busy ? "Salvataggio…" : "Salva"}
      </button>
    </form>
  );
}
