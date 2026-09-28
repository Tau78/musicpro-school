"use client";

import { LessonsPrintButton } from "@/components/lezioni/lessons-print-button";

export type CalendarView = "week" | "month";

export interface LessonsCalendarToolbarProps {
  view: CalendarView;
  dateLabel: string;
  /** Etichetta breve per viewport stretti (es. «21–26 set 2026»). */
  dateLabelShort?: string;
  hoursLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange?: (view: CalendarView) => void;
}

const navBtnClass =
  "touch-manipulation inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 hover:bg-neutral-50";

const actionBtnClass =
  "touch-manipulation rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-neutral-50 sm:px-2.5 sm:text-xs";

export function LessonsCalendarToolbar({
  view,
  dateLabel,
  dateLabelShort,
  hoursLabel,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: LessonsCalendarToolbarProps) {
  const shortLabel = dateLabelShort ?? dateLabel;
  const viewToggleLabel =
    view === "week" ? "Vista mensile" : "Vista settimanale";
  const viewToggleShort = view === "week" ? "Mese" : "Settimana";

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 px-1.5 py-1 sm:px-2">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label={
            view === "week" ? "Settimana precedente" : "Mese precedente"
          }
          className={navBtnClass}
        >
          ‹
        </button>

        <div className="min-w-0 flex-1 px-0.5 text-center">
          <p
            className="truncate text-xs font-semibold capitalize text-neutral-800 sm:hidden"
            title={dateLabel}
          >
            {shortLabel}
          </p>
          <p
            className="hidden truncate text-sm font-semibold capitalize text-neutral-800 sm:block"
            title={dateLabel}
          >
            {dateLabel}
          </p>
          <p className="mt-0.5 truncate text-[10px] tabular-nums text-neutral-500">
            {hoursLabel}
          </p>
        </div>

        <button
          type="button"
          onClick={onNext}
          aria-label={
            view === "week" ? "Settimana successiva" : "Mese successivo"
          }
          className={navBtnClass}
        >
          ›
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-1 border-t border-neutral-200/70 pt-1">
        <button
          type="button"
          onClick={onToday}
          className={`${actionBtnClass} text-[var(--brand)]`}
        >
          Oggi
        </button>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => onViewChange?.(view === "week" ? "month" : "week")}
            className={`${actionBtnClass} max-w-[5.5rem] truncate text-neutral-700 sm:max-w-none`}
            title={viewToggleLabel}
          >
            <span className="sm:hidden">{viewToggleShort}</span>
            <span className="hidden sm:inline">{viewToggleLabel}</span>
          </button>
          {view === "week" ? <LessonsPrintButton /> : null}
        </div>
      </div>
    </div>
  );
}
