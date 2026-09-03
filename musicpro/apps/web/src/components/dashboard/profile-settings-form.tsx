"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { updateOwnProfile } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export type ProfileSettingsInitial = {
  memberId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthProvince: string | null;
  taxCode: string | null;
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ProfileSettingsForm({ initial }: { initial: ProfileSettingsInitial }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [addressStreet, setAddressStreet] = useState(initial.addressStreet ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(
    initial.addressPostalCode ?? "",
  );
  const [addressCity, setAddressCity] = useState(initial.addressCity ?? "");
  const [addressProvince, setAddressProvince] = useState(
    initial.addressProvince ?? "",
  );
  const [birthDate, setBirthDate] = useState(toDateInput(initial.birthDate));
  const [birthPlace, setBirthPlace] = useState(initial.birthPlace ?? "");
  const [birthProvince, setBirthProvince] = useState(initial.birthProvince ?? "");
  const [taxCode, setTaxCode] = useState(initial.taxCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOk(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Nome e cognome sono obbligatori.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const result = await updateOwnProfile(supabase, initial.memberId, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || null,
      addressStreet: addressStreet.trim() || null,
      addressPostalCode: addressPostalCode.trim() || null,
      addressCity: addressCity.trim() || null,
      addressProvince: addressProvince.trim() || null,
      birthDate: birthDate || null,
      birthPlace: birthPlace.trim() || null,
      birthProvince: birthProvince.trim() || null,
      taxCode: taxCode.trim() || null,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Salvataggio non riuscito.");
      return;
    }

    setOk("Dati salvati.");
    router.refresh();
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-first-name" className="block text-sm font-medium text-neutral-700">
            Nome
          </label>
          <input
            id="profile-first-name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-last-name" className="block text-sm font-medium text-neutral-700">
            Cognome
          </label>
          <input
            id="profile-last-name"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium text-neutral-700">
            Telefono
          </label>
          <input
            id="profile-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-tax-code" className="block text-sm font-medium text-neutral-700">
            Codice fiscale
          </label>
          <input
            id="profile-tax-code"
            name="taxCode"
            type="text"
            autoComplete="off"
            value={taxCode}
            onChange={(e) => setTaxCode(e.target.value.toUpperCase())}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="profile-address-street" className="block text-sm font-medium text-neutral-700">
            Indirizzo
          </label>
          <input
            id="profile-address-street"
            name="addressStreet"
            type="text"
            autoComplete="street-address"
            value={addressStreet}
            onChange={(e) => setAddressStreet(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-address-cap" className="block text-sm font-medium text-neutral-700">
            CAP
          </label>
          <input
            id="profile-address-cap"
            name="addressPostalCode"
            type="text"
            autoComplete="postal-code"
            value={addressPostalCode}
            onChange={(e) => setAddressPostalCode(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-address-city" className="block text-sm font-medium text-neutral-700">
            Città
          </label>
          <input
            id="profile-address-city"
            name="addressCity"
            type="text"
            autoComplete="address-level2"
            value={addressCity}
            onChange={(e) => setAddressCity(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-address-province" className="block text-sm font-medium text-neutral-700">
            Provincia
          </label>
          <input
            id="profile-address-province"
            name="addressProvince"
            type="text"
            autoComplete="address-level1"
            maxLength={2}
            value={addressProvince}
            onChange={(e) => setAddressProvince(e.target.value.toUpperCase())}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-birth-date" className="block text-sm font-medium text-neutral-700">
            Data di nascita
          </label>
          <input
            id="profile-birth-date"
            name="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-birth-place" className="block text-sm font-medium text-neutral-700">
            Luogo di nascita
          </label>
          <input
            id="profile-birth-place"
            name="birthPlace"
            type="text"
            value={birthPlace}
            onChange={(e) => setBirthPlace(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-birth-province" className="block text-sm font-medium text-neutral-700">
            Provincia di nascita
          </label>
          <input
            id="profile-birth-province"
            name="birthProvince"
            type="text"
            maxLength={2}
            value={birthProvince}
            onChange={(e) => setBirthProvince(e.target.value.toUpperCase())}
            className={inputClass}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-green-700">{ok}</p> : null}

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
