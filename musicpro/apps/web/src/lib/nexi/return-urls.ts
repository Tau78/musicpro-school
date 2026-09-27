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

export function buildRoomBookingReturnUrl(
  baseUrl: string,
  payload: {
    bookingId: string;
    importo: string;
  },
): string {
  const safeBase = baseUrl.trim().replace(/[?&]$/, "");
  const sep = safeBase.includes("?") ? "&" : "?";
  const q = new URLSearchParams({
    bookingId: payload.bookingId,
    importo: payload.importo,
    dopoPagamento: "1",
  });

  return `${safeBase}${sep}${q.toString()}`;
}

export function buildCreditShopReturnUrl(baseUrl: string): string {
  const safeBase = baseUrl.trim().replace(/[?&]$/, "");
  const sep = safeBase.includes("?") ? "&" : "?";
  const q = new URLSearchParams({ dopoPagamento: "1" });

  return `${safeBase}${sep}${q.toString()}`;
}

export function iscrizioneReturnBase(): string {
  return (
    process.env.NEXI_ISCRIZIONE_RETURN_URL ||
    process.env.STRIPE_RETURN_URL ||
    "https://iscrizione.musicproeventi.it/"
  ).trim();
}
