export type PrenotazioniLista =
  | "da-approvare"
  | "prossime"
  | "tutte"
  | "cestino";

export function parsePrenotazioniLista(
  value: string | undefined | null,
): PrenotazioniLista {
  if (value === "prossime" || value === "tutte" || value === "cestino") {
    return value;
  }
  return "da-approvare";
}
