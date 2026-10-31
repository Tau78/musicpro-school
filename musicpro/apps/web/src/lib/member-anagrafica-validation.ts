const IT_CF_RE =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

export type ProfileAnagraficaInput = {
  firstName: string;
  lastName: string;
  taxCode: string;
  phone: string;
  addressStreet: string;
  addressPostalCode: string;
  addressCity: string;
  addressProvince: string;
  birthDate: string;
  birthPlace: string;
  birthProvince: string;
};

/** Validazione coerenza sui campi compilati (onboarding / profilo). */
export function validateProfileAnagrafica(
  data: ProfileAnagraficaInput,
  options: { requireTaxCode: boolean; fieldsPresent: Set<keyof ProfileAnagraficaInput> },
): string | null {
  const nome = data.firstName.trim();
  const cognome = data.lastName.trim();
  if (!nome || !cognome) return "Nome e cognome obbligatori.";

  const cf = data.taxCode.trim().toUpperCase();
  if (options.requireTaxCode || (options.fieldsPresent.has("taxCode") && cf)) {
    if (!cf) return "Inserisci il codice fiscale.";
    if (!IT_CF_RE.test(cf)) {
      return "Codice fiscale non valido (16 caratteri, formato italiano).";
    }
  }

  if (options.fieldsPresent.has("birthDate") && data.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)) {
      return "Data di nascita non valida.";
    }
    const born = new Date(`${data.birthDate}T12:00:00`);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (Number.isNaN(born.getTime()) || born > today) {
      return "La data di nascita non può essere nel futuro.";
    }
    const oldest = new Date();
    oldest.setFullYear(oldest.getFullYear() - 120);
    if (born < oldest) return "Data di nascita non plausibile.";
  }

  if (options.fieldsPresent.has("birthProvince") && data.birthProvince.trim()) {
    if (!/^[A-Z]{2}$/.test(data.birthProvince.trim().toUpperCase())) {
      return "Provincia di nascita: inserisci 2 lettere (es. GE).";
    }
  }

  if (options.fieldsPresent.has("addressPostalCode") && data.addressPostalCode.trim()) {
    if (!/^\d{5}$/.test(data.addressPostalCode.trim())) {
      return "CAP non valido (5 cifre).";
    }
  }

  if (options.fieldsPresent.has("addressProvince") && data.addressProvince.trim()) {
    if (!/^[A-Z]{2}$/.test(data.addressProvince.trim().toUpperCase())) {
      return "Provincia di residenza: inserisci 2 lettere (es. GE).";
    }
  }

  if (options.fieldsPresent.has("phone") && data.phone.trim()) {
    const digits = data.phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return "Numero di telefono non valido (9–15 cifre).";
    }
  }

  return null;
}

/** Campi necessari per sbloccare dashboard (allineato a membership / middleware). */
export function listBlockingOnboardingFields(
  row: ProfileAnagraficaInput,
  requireTaxCode: boolean,
): (keyof ProfileAnagraficaInput)[] {
  const missing: (keyof ProfileAnagraficaInput)[] = [];
  const add = (key: keyof ProfileAnagraficaInput, empty: boolean) => {
    if (empty) missing.push(key);
  };

  add("firstName", !row.firstName.trim());
  add("lastName", !row.lastName.trim());
  if (requireTaxCode || !row.taxCode.trim()) {
    add("taxCode", !row.taxCode.trim());
  }

  return missing;
}

/** Anagrafica consigliata ma non bloccante per l’accesso. */
export function listRecommendedProfileFields(
  row: ProfileAnagraficaInput,
): (keyof ProfileAnagraficaInput)[] {
  const keys: (keyof ProfileAnagraficaInput)[] = [
    "phone",
    "birthDate",
    "birthPlace",
    "birthProvince",
    "addressStreet",
    "addressPostalCode",
    "addressCity",
    "addressProvince",
  ];
  return keys.filter((key) => !String(row[key] ?? "").trim());
}
