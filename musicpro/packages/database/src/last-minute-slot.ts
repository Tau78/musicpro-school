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
const ROME_WEEKDAY_TO_KEY: Record<string, string> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

/**
 * Il cron last minute gira se quel giorno ha la fascia accesa in impostazioni.
 * Non serve che ci sia già una prenotazione: quella accende solo il preavviso a zero.
 */
export function isLastMinuteDayEnabled(
  schedule: Record<string, { enabled?: boolean } | undefined>,
  dayRome: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayRome)) return false;
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
  }).format(new Date(`${dayRome}T12:00:00Z`));
  const key = ROME_WEEKDAY_TO_KEY[label];
  if (!key) return false;
  return schedule[key]?.enabled === true;
}

export function isSlotOpenForLastMinute(slot: {
  available: boolean;
  bookingId?: string | null;
  leadTimeCategory?: string | null;
}): boolean {
  if (slot.bookingId) return false;
  return slot.available || slot.leadTimeCategory === "too_late";
}
