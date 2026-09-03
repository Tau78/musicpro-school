const TECHNICAL_PATTERNS = [
  "supabase",
  "postgres",
  "postgrest",
  "pgrst",
  "gotrue",
  "jwt",
  "webhook",
  "stripe http",
  "config ",
  "rpc ",
  "row level",
  "relying party",
  "webauthn",
  "invalid api key",
  "service role",
];

function looksTechnical(message: string): boolean {
  const text = message.toLowerCase();
  return TECHNICAL_PATTERNS.some((pattern) => text.includes(pattern));
}

/** Messaggi di errore da Supabase Auth → italiano per l'utente. */
export function mapAuthError(message: string): string {
  const text = message.toLowerCase();

  if (
    text.includes("invalid login credentials") ||
    text.includes("invalid_credentials")
  ) {
    return "Email o password non corretti.";
  }
  if (text.includes("email not confirmed")) {
    return "Conferma prima la tua email, poi riprova ad accedere.";
  }
  if (
    text.includes("user already registered") ||
    text.includes("already been registered")
  ) {
    return "Esiste già un account con questa email. Prova ad accedere.";
  }
  if (
    text.includes("signup is disabled") ||
    text.includes("signups not allowed")
  ) {
    return "La registrazione non è disponibile. Contatta la segreteria.";
  }
  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "Troppi tentativi. Riprova tra qualche minuto.";
  }
  if (text.includes("otp") && text.includes("disabled")) {
    return "L'accesso via link email non è disponibile. Usa email e password.";
  }
  if (
    text.includes("email") &&
    (text.includes("invalid") || text.includes("format"))
  ) {
    return "Indirizzo email non valido.";
  }
  if (text.includes("same") || text.includes("should be different")) {
    return "La nuova password deve essere diversa da quella attuale.";
  }
  if (
    text.includes("leaked") ||
    text.includes("pwned") ||
    text.includes("data breach")
  ) {
    return "Questa password risulta compromessa. Scegline un'altra.";
  }
  if (text.includes("weak") || text.includes("characters")) {
    return "La password è troppo debole. Usa almeno 8 caratteri.";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("networkerror")
  ) {
    return "Problema di connessione. Controlla la rete e riprova.";
  }
  if (looksTechnical(message)) {
    return "Impossibile completare l'operazione. Riprova o contatta la segreteria.";
  }

  return message || "Impossibile completare l'operazione.";
}

export function mapPasswordUpdateError(message: string): string {
  return mapAuthError(message) || "Impossibile aggiornare la password.";
}

/** Codici ?error= nel login → messaggio italiano. */
export function mapLoginQueryError(code: string | null): string | null {
  if (!code) return null;

  switch (code) {
    case "member_not_linked":
      return "Nessun profilo associato trovato per questo account. Contatta la segreteria.";
    case "unauthorized":
      return "Non hai i permessi per accedere a quella sezione.";
    case "auth_callback_missing_code":
    case "auth_callback_failed":
      return "Link di accesso non valido o scaduto. Richiedine uno nuovo.";
    default:
      return null;
  }
}

/** Evita di mostrare messaggi tecnici da API o database. */
export function mapUserFacingError(
  message: string,
  fallback = "Operazione non riuscita.",
): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (looksTechnical(trimmed)) return fallback;
  if (trimmed.toLowerCase().includes("stripe")) return fallback;
  return trimmed;
}
