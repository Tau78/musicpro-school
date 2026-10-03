const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarViewParam = "day" | "3day" | "week" | "month";
export type CalendarModeParam = "docente" | "sala";
export type CalendarScopeParam = "tutto" | "lezioni" | "prenotazioni";

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && ISO_DATE_RE.test(value));
}

export function parseCalendarView(
  value: string | null | undefined,
): CalendarViewParam {
  if (value === "month") return "month";
  if (value === "day") return "day";
  if (value === "3day" || value === "3g") return "3day";
  return "week";
}

export function parseCalendarMode(
  value: string | null | undefined,
): CalendarModeParam {
  return value === "sala" ? "sala" : "docente";
}

export function parseCalendarScope(
  value: string | null | undefined,
): CalendarScopeParam {
  if (value === "lezioni") return "lezioni";
  if (value === "prenotazioni") return "prenotazioni";
  return "tutto";
}

export function dayBounds(anchor: string): { from: string; to: string } {
  const day = normalizeAnchor(anchor);
  return { from: day, to: addDays(day, 1) };
}

export function threeDayBounds(anchor: string): { from: string; to: string } {
  const day = normalizeAnchor(anchor);
  return { from: day, to: addDays(day, 3) };
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

export function calendarBounds(
  view: CalendarViewParam,
  anchor: string,
  sundayVisible: boolean,
): { from: string; to: string } {
  switch (view) {
    case "month":
      return monthBounds(anchor);
    case "week":
      return weekBounds(anchor, sundayVisible);
    case "3day":
      return threeDayBounds(anchor);
    case "day":
      return dayBounds(anchor);
  }
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
