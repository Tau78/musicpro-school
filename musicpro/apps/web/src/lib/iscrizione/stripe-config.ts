export type StripeMode = "test" | "live";

export interface StripeConfig {
  secret: string;
  currency: string;
  mode: StripeMode;
  returnBase: string;
}

function normalizeMode(raw: string | undefined): StripeMode {
  return String(raw || "test").toLowerCase().trim() === "live" ? "live" : "test";
}

function keyPrefix(secret: string): StripeMode | "" {
  if (secret.startsWith("sk_live_")) return "live";
  if (secret.startsWith("sk_test_")) return "test";
  return "";
}

function resolveSecretKey(mode: StripeMode): string {
  const testKey = (
    process.env.STRIPE_SECRET_KEY_TEST ||
    process.env.STRIPE_SECRET_KEY ||
    ""
  ).trim();
  const liveKey = (process.env.STRIPE_SECRET_KEY_LIVE || "").trim();
  const legacyKey = (process.env.STRIPE_SECRET_KEY || "").trim();

  let secret = mode === "live" ? liveKey : testKey;
  if (!secret && legacyKey) secret = legacyKey;

  if (!secret) {
    throw new Error(
      `Config mancante: imposta ${mode === "live" ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST"} (STRIPE_MODE=${mode}).`,
    );
  }

  if (secret.startsWith("rk_")) {
    throw new Error(
      "Chiave Stripe non valida: usa la Secret key (sk_...), non la Restricted key (rk_...).",
    );
  }

  const keyMode = keyPrefix(secret);
  if (keyMode && keyMode !== mode) {
    throw new Error(
      `Chiave Stripe non coerente con STRIPE_MODE=${mode}: usa sk_${mode}_...`,
    );
  }

  return secret;
}

export function getStripeConfig(): StripeConfig {
  const mode = normalizeMode(process.env.STRIPE_MODE);
  const secret = resolveSecretKey(mode);
  const returnBase = (process.env.STRIPE_RETURN_URL || "").trim();

  if (!returnBase) {
    throw new Error("Config mancante: STRIPE_RETURN_URL");
  }

  return {
    secret,
    currency: (process.env.STRIPE_CURRENCY || "eur").toLowerCase(),
    mode,
    returnBase,
  };
}

export function buildQuotaReturnUrl(
  baseUrl: string,
  payload: {
    idIscrizione: string;
    nome: string;
    cognome: string;
    importo: string;
  },
): string {
  let safeBase = baseUrl.trim().replace(/[?&]$/, "");
  safeBase = safeBase.replace(/[?&]page=conferma-pagamento/gi, "");
  safeBase = safeBase.replace(/[?&]page=iscrizione/gi, "").replace(/[?&]$/, "");

  const sep = safeBase.includes("?") ? "&" : "?";
  const q = new URLSearchParams({
    idIscrizione: payload.idIscrizione,
    nome: payload.nome,
    cognome: payload.cognome,
    importo: payload.importo,
    dopoPagamento: "1",
  });

  return `${safeBase}${sep}${q.toString()}`;
}
