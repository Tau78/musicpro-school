export function addRomeDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function startOfWeekMonday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const js = new Date(utc).getUTCDay();
  const delta = js === 0 ? -6 : 1 - js;
  return addRomeDays(date, delta);
}

export function formatRomeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatRomeDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function romeYmd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Etichetta relativa in italiano (Europe/Rome):
 * «in corso», «tra 40 min», «tra 2 ore», «oggi alle 18:00», «domani alle 10:00»,
 * oppure giorno breve + orario.
 * `endsAt` opzionale: se presente e now è nell’intervallo → «in corso».
 */
export function formatRelativeLesson(
  iso: string | null | undefined,
  nowIso?: string,
  endsAt?: string | null,
): string {
  if (!iso) return "—";
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "—";

  const now = nowIso ? new Date(nowIso) : new Date();
  const end = endsAt ? new Date(endsAt) : null;
  const endOk = end && !Number.isNaN(end.getTime()) ? end : null;

  if (now.getTime() >= start.getTime() && endOk && now.getTime() < endOk.getTime()) {
    return "in corso";
  }

  const diffMs = start.getTime() - now.getTime();
  const time = formatRomeTime(iso);

  if (diffMs > 0) {
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 60) {
      return diffMin <= 1 ? "tra 1 min" : `tra ${diffMin} min`;
    }
    const diffHours = Math.round(diffMs / 3_600_000);
    if (diffHours <= 3 && romeYmd(iso) === romeYmd(now.toISOString())) {
      return diffHours === 1 ? "tra 1 ora" : `tra ${diffHours} ore`;
    }
  }

  const startDay = romeYmd(iso);
  const today = romeYmd(now.toISOString());
  const tomorrow = addRomeDays(today, 1);

  if (startDay === today) {
    return `oggi alle ${time}`;
  }
  if (startDay === tomorrow) {
    return `domani alle ${time}`;
  }

  return `${formatRomeDay(startDay)} · ${time}`;
}
