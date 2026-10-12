import type { CalendarView } from "@/components/lezioni/lessons-calendar-toolbar";

export const CALENDAR_VIEW_ORDER: CalendarView[] = [
  "day",
  "3day",
  "week",
  "month",
];

export const LONG_PRESS_MS = 420;
export const LONG_PRESS_MOVE_PX = 10;
/** Long-press su un evento prima di poterlo trascinare (touch). */
export const EVENT_DRAG_ARM_MS = 280;
export const EVENT_DRAG_MOVE_PX = 8;
export const SWIPE_MIN_PX = 56;
export const SWIPE_RATIO = 1.35;
export const PINCH_RATIO = 1.18;

/** Hit-test colonna giorno sotto il dito/cursore (usa data-* sulla colonna). */
export function hitTestDayColumn(
  clientX: number,
  clientY: number,
): { date: string; minute: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(clientX, clientY);
  const col = el?.closest("[data-day-column]") as HTMLElement | null;
  if (!col) return null;
  const date = col.dataset.date;
  const openMinute = Number(col.dataset.openMinute);
  const closeMinute = Number(col.dataset.closeMinute);
  if (!date || !Number.isFinite(openMinute) || !Number.isFinite(closeMinute)) {
    return null;
  }
  const rect = col.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  return {
    date,
    minute: openMinute + ratio * (closeMinute - openMinute),
  };
}

export function nextCalendarView(view: CalendarView): CalendarView | null {
  const index = CALENDAR_VIEW_ORDER.indexOf(view);
  if (index < 0 || index >= CALENDAR_VIEW_ORDER.length - 1) return null;
  return CALENDAR_VIEW_ORDER[index + 1]!;
}

export function prevCalendarView(view: CalendarView): CalendarView | null {
  const index = CALENDAR_VIEW_ORDER.indexOf(view);
  if (index <= 0) return null;
  return CALENDAR_VIEW_ORDER[index - 1]!;
}

export function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

/** Ampiezza orizzontale tra due tocchi (stretch del calendario). */
export function touchHorizontalSpan(
  a: { clientX: number },
  b: { clientX: number },
): number {
  return Math.abs(a.clientX - b.clientX);
}

export function vibrateLight(): void {
  try {
    navigator.vibrate?.(12);
  } catch {
    // ignore
  }
}

/** Fine evento sul giorno di inizio: mezzanotte / giorno dopo → +1440. */
export function resolvePlacedEndMinute(
  startMinute: number,
  endMinute: number,
  slotMinutes: number,
): number {
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) {
    return startMinute + Math.max(1, slotMinutes);
  }
  if (endMinute > startMinute) return endMinute;
  if (endMinute === startMinute) return startMinute + Math.max(1, slotMinutes);
  // es. 22:00→00:00: endMinute=0 → 1440
  return endMinute + 24 * 60;
}

/** Allunga la chiusura griglia per eventi oltre l’orario impostato (es. 22–24). */
export function extendGridCloseMinute(
  configuredCloseMinute: number,
  lessons: Array<{ endMinute: number }>,
): number {
  let close = configuredCloseMinute;
  for (const lesson of lessons) {
    if (Number.isFinite(lesson.endMinute) && lesson.endMinute > close) {
      close = lesson.endMinute;
    }
  }
  if (close % 60 !== 0) {
    close = Math.ceil(close / 60) * 60;
  }
  // Massimo: giorno + 6h (eventi che sconfinano oltre mezzanotte).
  return Math.min(close, 30 * 60);
}
