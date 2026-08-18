"use client";

import { LessonsPrintButton } from "@/components/lezioni/lessons-print-button";

export type CalendarView = "week" | "month";

export interface LessonsCalendarToolbarProps {
  view: CalendarView;
  dateLabel: string;
  hoursLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange?: (view: CalendarView) => void;
}

export function LessonsCalendarToolbar({
  view,
  dateLabel,
  hoursLabel,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: LessonsCalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={onToday}
        className="touch-manipulation rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-[var(--brand)] hover:bg-neutral-50"
      >
        Oggi
      </button>

      <p className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-neutral-800">
        {dateLabel}
        <span className="ml-2 text-xs font-medium tabular-nums text-neutral-500">
          {hoursLabel}
        </span>
      </p>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => onViewChange?.(view === "week" ? "month" : "week")}
          className="touch-manipulation rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {view === "week" ? "Vista mensile" : "Vista settimanale"}
        </button>
        {view === "week" ? <LessonsPrintButton /> : null}
        <button
          type="button"
          onClick={onPrev}
          aria-label={view === "week" ? "Settimana precedente" : "Mese precedente"}
          className="touch-manipulation inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 hover:bg-neutral-50"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label={view === "week" ? "Settimana successiva" : "Mese successivo"}
          className="touch-manipulation inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 hover:bg-neutral-50"
        >
          ›
        </button>
      </div>
    </div>
  );
}
