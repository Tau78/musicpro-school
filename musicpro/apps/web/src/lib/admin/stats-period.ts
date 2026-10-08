/** Periodi Stats (Europe/Rome, settimane lun→dom). */

export type StatsPreset = "week" | "month" | "year" | "custom";

export type DateRange = { from: string; to: string };

function parseIso(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function addDaysIso(date: string, days: number): string {
  const { y, m, d } = parseIso(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Giorno della settimana 0=lun … 6=dom (Rome calendar date). */
export function weekdayMondayIndex(date: string): number {
  const { y, m, d } = parseIso(date);
  const utcDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom
  return (utcDow + 6) % 7;
}

export function startOfWeekMonday(date: string): string {
  return addDaysIso(date, -weekdayMondayIndex(date));
}

export function startOfMonth(date: string): string {
  const { y, m } = parseIso(date);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function startOfYear(date: string): string {
  const { y } = parseIso(date);
  return `${y}-01-01`;
}

/** Range inclusivo [from, to] per il preset. */
export function rangeForPreset(
  preset: StatsPreset,
  today: string,
  custom?: DateRange | null,
): DateRange {
  if (preset === "custom" && custom?.from && custom?.to) {
    return custom.from <= custom.to
      ? custom
      : { from: custom.to, to: custom.from };
  }
  if (preset === "month") {
    return { from: startOfMonth(today), to: today };
  }
  if (preset === "year") {
    return { from: startOfYear(today), to: today };
  }
  const weekStart = startOfWeekMonday(today);
  return { from: weekStart, to: today };
}

/** Periodo precedente della stessa lunghezza (per confronto). */
export function previousRange(range: DateRange): DateRange {
  const { y: y1, m: m1, d: d1 } = parseIso(range.from);
  const { y: y2, m: m2, d: d2 } = parseIso(range.to);
  const startMs = Date.UTC(y1, m1 - 1, d1);
  const endMs = Date.UTC(y2, m2 - 1, d2);
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  const prevTo = addDaysIso(range.from, -1);
  const prevFrom = addDaysIso(prevTo, -(days - 1));
  return { from: prevFrom, to: prevTo };
}

export function eachDayInclusive(from: string, to: string, max = 366): string[] {
  const list: string[] = [];
  let cursor = from;
  while (cursor <= to && list.length < max) {
    list.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return list;
}

export function formatDayShort(date: string): string {
  const { y, m, d } = parseIso(date);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
