export type PrenotazioniLista = "da-approvare" | "prossime" | "tutte";

export function parsePrenotazioniLista(
  value: string | undefined | null,
): PrenotazioniLista {
  if (value === "prossime" || value === "tutte") return value;
  return "da-approvare";
}
