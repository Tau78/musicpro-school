const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarViewParam = "week" | "month";
export type CalendarModeParam = "docente" | "sala";

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && ISO_DATE_RE.test(value));
}

export function parseCalendarView(
  value: string | null | undefined,
): CalendarViewParam {
  return value === "month" ? "month" : "week";
}

export function parseCalendarMode(
  value: string | null | undefined,
): CalendarModeParam {
  return value === "sala" ? "sala" : "docente";
}

export function weekBounds(
  anchor: string,
  sundayVisible: boolean,
): { from: string; to: string } {
  const weekStart = startOfWeek(normalizeAnchor(anchor));
  const days = sundayVisible ? 7 : 6;
  return { from: weekStart, to: addDays(weekStart, days) };
}

export function monthBounds(anchor: string): { from: string; to: string } {
  const from = `${normalizeAnchor(anchor).slice(0, 7)}-01`;
  const [year, month] = from.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return { from, to: next.toISOString().slice(0, 10) };
}

function normalizeAnchor(anchor: string): string {
  return isIsoDate(anchor) ? anchor : "1970-01-01";
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function isoDow(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

function startOfWeek(date: string): string {
  return addDays(date, 1 - isoDow(date));
}
