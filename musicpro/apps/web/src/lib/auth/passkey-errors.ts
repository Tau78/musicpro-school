export function passkeyErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw.toLowerCase();

  if (
    text.includes("passkey_disabled") ||
    text.includes("not enabled") ||
    text.includes("passkeys are disabled") ||
    text.includes("passkey is disabled")
  ) {
    return "L’accesso rapido (Face ID o impronta) non è ancora attivo. Usa email e password.";
  }
  if (
    text.includes("not allowed") ||
    text.includes("abort") ||
    text.includes("cancel") ||
    text.includes("denied")
  ) {
    return "Accesso annullato.";
  }
  if (
    text.includes("credential_not_found") ||
    text.includes("no passkey") ||
    text.includes("not registered")
  ) {
    return "Nessun accesso rapido su questo dispositivo. Entra con la password e attivalo dalle Impostazioni.";
  }
  if (text.includes("not supported") || text.includes("webauthn")) {
    return "Questo browser non supporta Face ID, impronta o chiave di accesso.";
  }
  if (
    text.includes("rp id") ||
    text.includes("relying party") ||
    text.includes("invalid for this domain")
  ) {
    return "L’accesso rapido non è disponibile su questo sito. Entra con email e password.";
  }
  return "Impossibile usare l’accesso rapido.";
}
