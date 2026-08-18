"use client";

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            aria-label={view === "week" ? "Settimana precedente" : "Mese precedente"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onToday}
            className="rounded-lg border border-[var(--brand-accent)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand-accent)]/15"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label={view === "week" ? "Settimana successiva" : "Mese successivo"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
          >
            ›
          </button>
        </div>

        <p className="min-w-0 flex-1 text-base font-semibold capitalize text-[var(--brand)]">
          {dateLabel}
        </p>

        <div
          className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5"
          role="group"
          aria-label="Vista calendario"
        >
          <ViewToggle
            active={view === "week"}
            onClick={() => onViewChange?.("week")}
          >
            Settimana
          </ViewToggle>
          <ViewToggle
            active={view === "month"}
            onClick={() => onViewChange?.("month")}
          >
            Mese
          </ViewToggle>
        </div>
      </div>

      <p className="text-sm font-semibold tabular-nums text-[var(--brand)]">
        {hoursLabel}
      </p>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white"
          : "rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-white hover:text-neutral-900"
      }
    >
      {children}
    </button>
  );
}
