import type { CalendarView } from "@/components/lezioni/lessons-calendar-toolbar";

export const CALENDAR_VIEW_ORDER: CalendarView[] = [
  "day",
  "3day",
  "week",
  "month",
];

export const LONG_PRESS_MS = 420;
export const LONG_PRESS_MOVE_PX = 10;
export const SWIPE_MIN_PX = 56;
export const SWIPE_RATIO = 1.35;
export const PINCH_RATIO = 1.18;

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
