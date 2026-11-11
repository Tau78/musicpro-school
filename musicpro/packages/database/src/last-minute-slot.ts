/**
 * Confronto istanti, non stringhe.
 * Il calendario emette `….000Z`, Postgres `…+00:00`: sono lo stesso orario.
 */
export function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && left === right;
}

/**
 * Buco utile per il last minute.
 * Sotto le 6 ore il calendario pubblico marca lo slot `too_late` e non disponibile.
 * In serata operativa il preavviso è 0: se non c'è una prenotazione (né un evento
 * calendario, che arriva con `bookingId`) lo slot resta candidato.
 */
export function isSlotOpenForLastMinute(slot: {
  available: boolean;
  bookingId?: string | null;
  leadTimeCategory?: string | null;
}): boolean {
  if (slot.bookingId) return false;
  return slot.available || slot.leadTimeCategory === "too_late";
}
