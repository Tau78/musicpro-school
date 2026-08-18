export function passkeyErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw.toLowerCase();

  if (text.includes("passkey_disabled") || text.includes("not enabled")) {
    return "L’accesso con passkey non è ancora attivo. Usa email e password.";
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
    return "Nessuna passkey su questo dispositivo. Entra con la password e aggiungila dalla Dashboard.";
  }
  if (text.includes("not supported") || text.includes("webauthn")) {
    return "Questo browser non supporta le passkey.";
  }
  return raw || "Impossibile usare la passkey.";
}
