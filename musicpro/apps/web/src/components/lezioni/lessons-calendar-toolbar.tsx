"use client";

import { LessonsPrintButton } from "@/components/lezioni/lessons-print-button";

export type CalendarView = "day" | "3day" | "week" | "month";

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

const VIEW_OPTIONS: {
  id: CalendarView;
  short: string;
  label: string;
}[] = [
  { id: "day", short: "Giorno", label: "Vista giorno" },
  { id: "3day", short: "3 g.", label: "Vista 3 giorni" },
  { id: "week", short: "Sett.", label: "Vista settimanale" },
  { id: "month", short: "Mese", label: "Vista mensile" },
];

const navBtnClass =
  "touch-manipulation inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 hover:bg-neutral-50";

const actionBtnClass =
  "touch-manipulation rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-neutral-50 sm:px-2.5 sm:text-xs";

function prevAriaLabel(view: CalendarView): string {
  if (view === "day") return "Giorno precedente";
  if (view === "3day") return "3 giorni precedenti";
  if (view === "week") return "Settimana precedente";
  return "Mese precedente";
}

function nextAriaLabel(view: CalendarView): string {
  if (view === "day") return "Giorno successivo";
  if (view === "3day") return "3 giorni successivi";
  if (view === "week") return "Settimana successiva";
  return "Mese successivo";
}

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
  const showPrint = view !== "month";

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 px-1.5 py-1 sm:px-2">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label={prevAriaLabel(view)}
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
          aria-label={nextAriaLabel(view)}
          className={navBtnClass}
        >
          ›
        </button>
      </div>

      <div className="mt-1 flex items-center gap-1 border-t border-neutral-200/70 pt-1">
        <button
          type="button"
          onClick={onToday}
          className={`${actionBtnClass} shrink-0 text-[var(--brand)]`}
        >
          Oggi
        </button>

        <div
          className="flex min-w-0 flex-1 justify-center gap-0.5 overflow-x-auto rounded-md bg-neutral-200/60 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Vista calendario"
        >
          {VIEW_OPTIONS.map((option) => {
            const selected = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                title={option.label}
                onClick={() => onViewChange?.(option.id)}
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold touch-manipulation sm:px-2.5 sm:text-[11px] ${
                  selected
                    ? "bg-white text-[var(--brand)] shadow-sm"
                    : "text-neutral-600 hover:text-neutral-800"
                }`}
              >
                <span className="sm:hidden">{option.short}</span>
                <span className="hidden sm:inline">
                  {option.id === "3day" ? "3 giorni" : option.short}
                </span>
              </button>
            );
          })}
        </div>

        {showPrint ? (
          <div className="shrink-0">
            <LessonsPrintButton />
          </div>
        ) : (
          <span className="w-0 shrink-0 sm:w-8" aria-hidden />
        )}
      </div>
    </div>
  );
}
