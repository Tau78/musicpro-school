"use client";

/**
 * Colori card lezione (fetta 6):
 * - individuale: bg-amber-100 border-amber-300
 * - gruppo: bg-sky-100 border-sky-300
 * - online: bg-violet-100 border-violet-300
 * - prova (isTrial): bg-rose-100 border-rose-300 (anche se individuale)
 * - in_attesa: bordo tratteggiato amber
 * Chrome admin: navy --brand, accent oro --brand-accent, card rounded-xl
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getRomeMinutesFromMidnight,
  minutesToTimeLabel,
  romeLocalInputToUtcIso,
  todayInRome,
  type CourseKind,
  type CourseStatus,
} from "@musicpro/database";

import {
  LessonsCalendarToolbar,
  type CalendarView,
} from "@/components/lezioni/lessons-calendar-toolbar";

export type { CalendarView };

export type MoveScope = "this" | "future";

/** Allineata a CalendarLesson di @musicpro/database (quando verrà esportata). */
export interface CalendarLesson {
  id: string;
  courseId: string;
  sequenceNumber: number;
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  courseName: string;
  courseKind: CourseKind;
  courseStatus: CourseStatus;
  isTrial?: boolean;
  studentNames: string[];
  titularFirstName: string | null;
  titularLastName: string | null;
  roomName: string | null;
  hasAttendance?: boolean;
}

export interface LessonsCalendarProps {
  lessons: CalendarLesson[];
  view: CalendarView;
  /** YYYY-MM-DD (Europe/Rome). */
  anchorDate: string;
  sundayVisible: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  canDrag: boolean;
  showTeacherName: boolean;
  rooms: { id: string; name: string }[];
  onMove: (
    lessonId: string,
    startsAtIso: string,
    roomId: string | null,
    scope: MoveScope,
  ) => Promise<void>;
  onOpenLesson?: (lessonId: string) => void;
  onSelectDay?: (date: string) => void;
  onViewChange?: (view: CalendarView) => void;
  onAnchorDateChange?: (date: string) => void;
  /** YYYY-MM-DD evidenziato (click da mese). */
  highlightDay?: string | null;
}

const ROME = "Europe/Rome";
const SLOT_MINUTES = 15;
const PX_PER_HOUR = 64;
const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;
const DOW_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
const DRAG_MIME = "application/x-musicpro-lesson";

type PlacedLesson = CalendarLesson & {
  startsAt: string;
  endsAt: string;
  date: string;
  startMinute: number;
  endMinute: number;
};

type PendingMove = {
  lesson: PlacedLesson;
  date: string;
  startMinute: number;
  startsAtIso: string;
  roomId: string | null;
};

type HoverSlot = {
  date: string;
  startMinute: number;
  durationMinutes: number;
};

export function LessonsCalendar({
  lessons,
  view,
  anchorDate,
  sundayVisible,
  gridOpenMinute,
  gridCloseMinute,
  canDrag,
  showTeacherName,
  rooms,
  onMove,
  onOpenLesson,
  onSelectDay,
  onViewChange,
  onAnchorDateChange,
  highlightDay,
}: LessonsCalendarProps) {
  const openMinute = Number.isFinite(gridOpenMinute) ? gridOpenMinute : 600;
  const closeMinute =
    Number.isFinite(gridCloseMinute) && gridCloseMinute > openMinute
      ? gridCloseMinute
      : 1380;

  const placed = useMemo(() => placeLessons(lessons), [lessons]);
  const weekStart = startOfWeek(anchorDate);
  const weekDays = sundayVisible ? 7 : 6;
  const weekDates = useMemo(
    () => Array.from({ length: weekDays }, (_, i) => addDays(weekStart, i)),
    [weekStart, weekDays],
  );
  const monthDates = useMemo(() => monthCellDates(anchorDate), [anchorDate]);

  const visibleLessons = useMemo(() => {
    if (view === "week") {
      const set = new Set(weekDates);
      return placed.filter((lesson) => set.has(lesson.date));
    }
    const prefix = anchorDate.slice(0, 7);
    return placed.filter((lesson) => lesson.date.startsWith(prefix));
  }, [view, placed, weekDates, anchorDate]);

  const hoursLabel = formatOreLabel(
    visibleLessons.reduce((sum, lesson) => {
      return sum + Math.max(0, lesson.endMinute - lesson.startMinute);
    }, 0),
  );

  const dateLabel =
    view === "week"
      ? weekRangeLabel(weekDates[0]!, weekDates[weekDates.length - 1]!)
      : monthTitle(anchorDate);

  const [pending, setPending] = useState<PendingMove | null>(null);
  const [hover, setHover] = useState<HoverSlot | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragDuration, setDragDuration] = useState<number | null>(null);
  const dragLessonRef = useRef<PlacedLesson | null>(null);

  function goToday() {
    onAnchorDateChange?.(todayInRome());
  }

  function goPrev() {
    if (view === "week") onAnchorDateChange?.(addDays(weekStart, -7));
    else onAnchorDateChange?.(shiftMonth(anchorDate, -1));
  }

  function goNext() {
    if (view === "week") onAnchorDateChange?.(addDays(weekStart, 7));
    else onAnchorDateChange?.(shiftMonth(anchorDate, 1));
  }

  function handleDayClick(date: string) {
    if (onSelectDay) {
      onSelectDay(date);
      return;
    }
    onAnchorDateChange?.(date);
    onViewChange?.("week");
  }

  function beginDrag(lesson: PlacedLesson) {
    dragLessonRef.current = lesson;
    setDragDuration(Math.max(SLOT_MINUTES, lesson.endMinute - lesson.startMinute));
  }

  function endDrag() {
    dragLessonRef.current = null;
    setDragDuration(null);
    setHover(null);
  }

  function proposeMove(date: string, startMinute: number, lessonId?: string) {
    const lesson =
      dragLessonRef.current ??
      (lessonId ? placed.find((row) => row.id === lessonId) : undefined);
    if (!lesson) return;
    const duration = Math.max(SLOT_MINUTES, lesson.endMinute - lesson.startMinute);
    const snapped = snapMinute(startMinute, openMinute, closeMinute, duration);
    let startsAtIso: string;
    try {
      startsAtIso = romeLocalInputToUtcIso(
        `${date}T${minutesToTimeLabel(snapped)}`,
      );
    } catch {
      return;
    }
    setMoveError(null);
    setPending({
      lesson,
      date,
      startMinute: snapped,
      startsAtIso,
      roomId: lesson.roomId,
    });
    endDrag();
  }

  async function confirmMove(scope: MoveScope) {
    if (!pending) return;
    setMoving(true);
    setMoveError(null);
    try {
      await onMove(pending.lesson.id, pending.startsAtIso, pending.roomId, scope);
      setPending(null);
    } catch (error) {
      setMoveError(
        error instanceof Error
          ? error.message
          : "Impossibile spostare la lezione.",
      );
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <LessonsCalendarToolbar
        view={view}
        dateLabel={dateLabel}
        hoursLabel={hoursLabel}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onViewChange={onViewChange}
      />

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {view === "week" ? (
          <WeekGrid
            dates={weekDates}
            lessons={visibleLessons}
            openMinute={openMinute}
            closeMinute={closeMinute}
            canDrag={canDrag}
            showTeacherName={showTeacherName}
            highlightDay={highlightDay}
            hover={hover}
            dragDuration={dragDuration}
            onHover={setHover}
            onBeginDrag={beginDrag}
            onEndDrag={endDrag}
            onProposeMove={proposeMove}
            onOpenLesson={onOpenLesson}
          />
        ) : (
          <MonthGrid
            anchorDate={anchorDate}
            cells={monthDates}
            lessons={placed}
            highlightDay={highlightDay}
            onSelectDay={handleDayClick}
            onOpenLesson={onOpenLesson}
          />
        )}
      </div>

      {pending ? (
        <MoveLessonModal
          pending={pending}
          rooms={rooms}
          moving={moving}
          error={moveError}
          onRoomChange={(roomId) =>
            setPending((current) => (current ? { ...current, roomId } : current))
          }
          onConfirm={(scope) => void confirmMove(scope)}
          onClose={() => {
            if (!moving) {
              setPending(null);
              setMoveError(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function WeekGrid({
  dates,
  lessons,
  openMinute,
  closeMinute,
  canDrag,
  showTeacherName,
  highlightDay,
  hover,
  dragDuration,
  onHover,
  onBeginDrag,
  onEndDrag,
  onProposeMove,
  onOpenLesson,
}: {
  dates: string[];
  lessons: PlacedLesson[];
  openMinute: number;
  closeMinute: number;
  canDrag: boolean;
  showTeacherName: boolean;
  highlightDay?: string | null;
  hover: HoverSlot | null;
  dragDuration: number | null;
  onHover: (slot: HoverSlot | null) => void;
  onBeginDrag: (lesson: PlacedLesson) => void;
  onEndDrag: () => void;
  onProposeMove: (date: string, startMinute: number, lessonId?: string) => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const today = useTodayRome();
  const nowMinute = useNowMinute();
  const gridHeight = ((closeMinute - openMinute) / 60) * PX_PER_HOUR;
  const hourMarks = hourLabels(openMinute, closeMinute);
  const byDate = useMemo(() => {
    const map = new Map<string, PlacedLesson[]>();
    for (const date of dates) map.set(date, []);
    for (const lesson of lessons) {
      map.get(lesson.date)?.push(lesson);
    }
    return map;
  }, [dates, lessons]);

  const showNow =
    dates.includes(today) &&
    nowMinute >= openMinute &&
    nowMinute <= closeMinute;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: `3.5rem repeat(${dates.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-neutral-200 bg-neutral-50" />
        {dates.map((date) => {
          const isToday = date === today;
          const isHighlight = highlightDay === date;
          return (
            <div
              key={date}
              className={`border-b border-l border-neutral-200 px-2 py-2 text-center ${
                isToday
                  ? "bg-[var(--brand)]/5"
                  : isHighlight
                    ? "bg-[var(--brand-accent)]/15"
                    : "bg-neutral-50"
              }`}
            >
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  isToday ? "text-[var(--brand-accent)]" : "text-neutral-500"
                }`}
              >
                {DOW_SHORT[isoDow(date) - 1]}
              </p>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  isToday ? "text-[var(--brand)]" : "text-neutral-800"
                }`}
              >
                {Number(date.slice(8, 10))}
              </p>
            </div>
          );
        })}

        <div className="relative" style={{ height: gridHeight }}>
          {hourMarks.map((minute) => (
            <div
              key={minute}
              className="absolute right-1 -translate-y-2 text-[11px] tabular-nums text-neutral-400"
              style={{ top: minuteToPx(minute, openMinute) }}
            >
              {minutesToTimeLabel(minute)}
            </div>
          ))}
        </div>

        {dates.map((date) => (
          <DayColumn
            key={date}
            date={date}
            lessons={byDate.get(date) ?? []}
            openMinute={openMinute}
            closeMinute={closeMinute}
            height={gridHeight}
            hourMarks={hourMarks}
            isToday={date === today}
            isHighlight={highlightDay === date}
            showNow={showNow && date === today}
            nowMinute={nowMinute}
            canDrag={canDrag}
            showTeacherName={showTeacherName}
            hover={hover?.date === date ? hover : null}
            dragDuration={dragDuration}
            onHover={onHover}
            onBeginDrag={onBeginDrag}
            onEndDrag={onEndDrag}
            onProposeMove={onProposeMove}
            onOpenLesson={onOpenLesson}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  date,
  lessons,
  openMinute,
  closeMinute,
  height,
  hourMarks,
  isToday,
  isHighlight,
  showNow,
  nowMinute,
  canDrag,
  showTeacherName,
  hover,
  dragDuration,
  onHover,
  onBeginDrag,
  onEndDrag,
  onProposeMove,
  onOpenLesson,
}: {
  date: string;
  lessons: PlacedLesson[];
  openMinute: number;
  closeMinute: number;
  height: number;
  hourMarks: number[];
  isToday: boolean;
  isHighlight: boolean;
  showNow: boolean;
  nowMinute: number;
  canDrag: boolean;
  showTeacherName: boolean;
  hover: HoverSlot | null;
  dragDuration: number | null;
  onHover: (slot: HoverSlot | null) => void;
  onBeginDrag: (lesson: PlacedLesson) => void;
  onEndDrag: () => void;
  onProposeMove: (date: string, startMinute: number, lessonId?: string) => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const layouts = useMemo(() => layoutOverlaps(lessons), [lessons]);

  function minuteFromEvent(event: React.DragEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    return openMinute + (y / PX_PER_HOUR) * 60;
  }

  return (
    <div
      className={`relative border-l border-neutral-200 ${
        isToday
          ? "bg-[var(--brand)]/[0.03]"
          : isHighlight
            ? "bg-[var(--brand-accent)]/[0.08]"
            : ""
      }`}
      style={{ height }}
      onDragOver={(event) => {
        if (!canDrag) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const duration = dragDuration ?? 60;
        const startMinute = snapMinute(
          minuteFromEvent(event),
          openMinute,
          closeMinute,
          duration,
        );
        onHover({ date, startMinute, durationMinutes: duration });
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        onHover(null);
      }}
      onDrop={(event) => {
        if (!canDrag) return;
        event.preventDefault();
        const lessonId =
          event.dataTransfer.getData(DRAG_MIME) ||
          event.dataTransfer.getData("text/plain");
        onProposeMove(date, minuteFromEvent(event), lessonId || undefined);
      }}
    >
      {hourMarks.map((minute) => (
        <div
          key={minute}
          className="pointer-events-none absolute inset-x-0 border-t border-neutral-100"
          style={{ top: minuteToPx(minute, openMinute) }}
        />
      ))}

      {hover ? (
        <div
          className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-[var(--brand)] bg-[var(--brand)]/10"
          style={{
            top: minuteToPx(hover.startMinute, openMinute),
            height: Math.max(
              12,
              ((hover.durationMinutes) / 60) * PX_PER_HOUR,
            ),
          }}
        />
      ) : null}

      {layouts.map(({ lesson, col, cols }) => {
        const top = minuteToPx(lesson.startMinute, openMinute);
        const rawHeight =
          ((lesson.endMinute - lesson.startMinute) / 60) * PX_PER_HOUR;
        const heightPx = Math.max(22, rawHeight);
        const widthPct = 100 / cols;
        return (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            canDrag={canDrag}
            showTeacherName={showTeacherName}
            style={{
              top,
              height: heightPx,
              left: `calc(${col * widthPct}% + 0.2rem)`,
              width: `calc(${widthPct}% - 0.4rem)`,
            }}
            onBeginDrag={onBeginDrag}
            onEndDrag={onEndDrag}
            onOpenLesson={onOpenLesson}
          />
        );
      })}

      {showNow ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 border-t border-red-500"
          style={{ top: minuteToPx(nowMinute, openMinute) }}
          aria-hidden
        >
          <span className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-red-500" />
        </div>
      ) : null}
    </div>
  );
}

function LessonCard({
  lesson,
  canDrag,
  showTeacherName,
  style,
  onBeginDrag,
  onEndDrag,
  onOpenLesson,
}: {
  lesson: PlacedLesson;
  canDrag: boolean;
  showTeacherName: boolean;
  style: React.CSSProperties;
  onBeginDrag: (lesson: PlacedLesson) => void;
  onEndDrag: () => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const dragged = useRef(false);
  const teacher = teacherLabel(lesson);
  const title = lessonTitle(lesson);
  const time = `${minutesToTimeLabel(lesson.startMinute)}–${minutesToTimeLabel(lesson.endMinute)}`;
  const isHold = lesson.id.startsWith("hold:");
  const draggable = canDrag && !isHold && !lesson.hasAttendance;

  function open() {
    if (dragged.current) return;
    onOpenLesson?.(lesson.id);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      title={`${title} · ${time}${lesson.roomName ? ` · ${lesson.roomName}` : ""}`}
      onDragStart={(event) => {
        if (!draggable) {
          event.preventDefault();
          return;
        }
        dragged.current = true;
        event.dataTransfer.setData(DRAG_MIME, lesson.id);
        event.dataTransfer.setData("text/plain", lesson.id);
        event.dataTransfer.effectAllowed = "move";
        onBeginDrag(lesson);
      }}
      onDragEnd={() => {
        onEndDrag();
        window.setTimeout(() => {
          dragged.current = false;
        }, 0);
      }}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className={`absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left leading-tight shadow-sm ${lessonCardClass(lesson)} ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${lesson.hasAttendance && !isHold ? "opacity-80" : ""}`}
      style={style}
    >
      <p className="truncate text-[11px] font-semibold text-neutral-900">
        {title}
      </p>
      <p className="truncate text-[10px] tabular-nums text-neutral-700">
        {time}
        {lesson.roomName ? ` · ${lesson.roomName}` : ""}
      </p>
      {showTeacherName && teacher ? (
        <p className="truncate text-[10px] text-neutral-600">{teacher}</p>
      ) : null}
      {lesson.hasAttendance && !isHold ? (
        <p className="truncate text-[9px] font-medium uppercase tracking-wide text-neutral-500">
          Presenze
        </p>
      ) : null}
    </div>
  );
}

function MonthGrid({
  anchorDate,
  cells,
  lessons,
  highlightDay,
  onSelectDay,
  onOpenLesson,
}: {
  anchorDate: string;
  cells: string[];
  lessons: PlacedLesson[];
  highlightDay?: string | null;
  onSelectDay: (date: string) => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const today = useTodayRome();
  const monthPrefix = anchorDate.slice(0, 7);
  const byDate = useMemo(() => {
    const map = new Map<string, PlacedLesson[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.date) ?? [];
      list.push(lesson);
      map.set(lesson.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startMinute - b.startMinute);
    }
    return map;
  }, [lessons]);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
        {DOW_SHORT.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const inMonth = date.startsWith(monthPrefix);
          const dayLessons = byDate.get(date) ?? [];
          const extra = Math.max(0, dayLessons.length - 3);
          const isToday = date === today;
          const isHighlight = highlightDay === date;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(date)}
              className={`min-h-[7.5rem] border-b border-r border-neutral-100 px-1.5 py-1.5 text-left align-top last:border-r-0 hover:bg-neutral-50 ${
                inMonth ? "bg-white" : "bg-neutral-50/80"
              } ${isHighlight && !isToday ? "bg-[var(--brand-accent)]/10" : ""}`}
            >
              <span
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ${
                  isToday
                    ? "bg-[var(--brand)] text-white"
                    : isHighlight
                      ? "bg-[var(--brand-accent)]/30 text-[var(--brand)]"
                      : inMonth
                        ? "text-neutral-800"
                        : "text-neutral-400"
                }`}
              >
                {Number(date.slice(8, 10))}
              </span>
              <ul className="mt-1 space-y-0.5">
                {dayLessons.slice(0, 3).map((lesson) => (
                  <li key={lesson.id}>
                    <span
                      role={onOpenLesson ? "button" : undefined}
                      tabIndex={onOpenLesson ? 0 : undefined}
                      onClick={(event) => {
                        if (!onOpenLesson) return;
                        event.stopPropagation();
                        onOpenLesson(lesson.id);
                      }}
                      onKeyDown={(event) => {
                        if (!onOpenLesson) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenLesson(lesson.id);
                      }}
                      className={`block truncate rounded border px-1 py-0.5 text-[10px] font-medium ${lessonCardClass(lesson)}`}
                    >
                      {`#${lesson.sequenceNumber} ${chipName(lesson)}`}
                    </span>
                  </li>
                ))}
                {extra > 0 ? (
                  <li className="px-1 text-[10px] font-medium text-neutral-500">
                    +{extra}
                  </li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MoveLessonModal({
  pending,
  rooms,
  moving,
  error,
  onRoomChange,
  onConfirm,
  onClose,
}: {
  pending: PendingMove;
  rooms: { id: string; name: string }[];
  moving: boolean;
  error: string | null;
  onRoomChange: (roomId: string | null) => void;
  onConfirm: (scope: MoveScope) => void;
  onClose: () => void;
}) {
  const online = pending.lesson.courseKind === "online";
  const timeLabel = minutesToTimeLabel(pending.startMinute);
  const dateLabel = formatDayLong(pending.date);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-lesson-title"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h3
          id="move-lesson-title"
          className="text-lg font-semibold text-[var(--brand)]"
        >
          Sposta lezione
        </h3>
        <p className="mt-2 text-sm text-neutral-600">
          {lessonTitle(pending.lesson)} · {dateLabel} alle {timeLabel}
        </p>

        {!online && rooms.length > 0 ? (
          <label className="mt-4 block text-xs font-medium text-neutral-600">
            Sala
            <select
              value={pending.roomId ?? ""}
              disabled={moving}
              onChange={(event) =>
                onRoomChange(event.target.value ? event.target.value : null)
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              <option value="">Nessuna sala</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            disabled={moving}
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={moving}
            onClick={() => onConfirm("this")}
            className="rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-50"
          >
            Solo questa lezione
          </button>
          <button
            type="button"
            disabled={moving}
            onClick={() => onConfirm("future")}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {moving ? "Spostamento…" : "Questa e le future"}
          </button>
        </div>
      </div>
    </div>
  );
}

function placeLessons(lessons: CalendarLesson[]): PlacedLesson[] {
  const rows: PlacedLesson[] = [];
  for (const lesson of lessons) {
    if (!lesson.startsAt || !lesson.endsAt) continue;
    const startMinute = getRomeMinutesFromMidnight(lesson.startsAt);
    const endMinute = getRomeMinutesFromMidnight(lesson.endsAt);
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) continue;
    rows.push({
      ...lesson,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      date: romeDateFromIso(lesson.startsAt),
      startMinute,
      endMinute: endMinute > startMinute ? endMinute : startMinute + SLOT_MINUTES,
    });
  }
  return rows;
}

function layoutOverlaps(lessons: PlacedLesson[]): {
  lesson: PlacedLesson;
  col: number;
  cols: number;
}[] {
  const sorted = lessons
    .map((lesson, index) => ({ lesson, index }))
    .sort(
      (a, b) =>
        a.lesson.startMinute - b.lesson.startMinute ||
        a.lesson.endMinute - b.lesson.endMinute,
    );
  const result = lessons.map((lesson) => ({ lesson, col: 0, cols: 1 }));
  let cluster: typeof sorted = [];
  let clusterEnd = -1;

  function flush() {
    if (cluster.length === 0) return;
    const ends: number[] = [];
    for (const item of cluster) {
      let col = ends.findIndex((end) => end <= item.lesson.startMinute);
      if (col < 0) {
        col = ends.length;
        ends.push(item.lesson.endMinute);
      } else {
        ends[col] = item.lesson.endMinute;
      }
      result[item.index] = { lesson: item.lesson, col, cols: 1 };
    }
    const cols = Math.max(1, ends.length);
    for (const item of cluster) {
      result[item.index].cols = cols;
    }
    cluster = [];
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.lesson.startMinute >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.lesson.endMinute);
  }
  flush();
  return result;
}

function lessonCardClass(lesson: CalendarLesson): string {
  const dashed =
    lesson.courseStatus === "in_attesa" ? "border-dashed border-amber-400" : "";
  if (lesson.isTrial) {
    return `bg-rose-100 ${dashed || "border-rose-300"}`;
  }
  switch (lesson.courseKind) {
    case "gruppo":
      return `bg-sky-100 ${dashed || "border-sky-300"}`;
    case "online":
      return `bg-violet-100 ${dashed || "border-violet-300"}`;
    case "individuale":
    default:
      return `bg-amber-100 ${dashed || "border-amber-300"}`;
  }
}

function lessonTitle(lesson: CalendarLesson): string {
  return `#${lesson.sequenceNumber} ${chipName(lesson)}`;
}

function chipName(lesson: CalendarLesson): string {
  const course = lesson.courseName.trim();
  if (course) return course;
  return lesson.studentNames[0]?.trim() || "Lezione";
}

function teacherLabel(lesson: CalendarLesson): string | null {
  const name = [lesson.titularFirstName, lesson.titularLastName]
    .filter((part) => part && part.trim())
    .join(" ")
    .trim();
  return name || null;
}

function formatOreLabel(minutes: number): string {
  const hours = Math.max(0, minutes) / 60;
  const text = new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2,
  }).format(hours);
  return `${text} ore`;
}

function minuteToPx(minute: number, openMinute: number): number {
  return ((minute - openMinute) / 60) * PX_PER_HOUR;
}

function snapMinute(
  minute: number,
  openMinute: number,
  closeMinute: number,
  duration: number,
): number {
  const snapped = Math.round(minute / SLOT_MINUTES) * SLOT_MINUTES;
  const maxStart = Math.max(openMinute, closeMinute - duration);
  return clamp(snapped, openMinute, maxStart);
}

function hourLabels(openMinute: number, closeMinute: number): number[] {
  const first = Math.ceil(openMinute / 60) * 60;
  const marks: number[] = [];
  if (openMinute % 60 !== 0) marks.push(openMinute);
  for (let minute = first; minute <= closeMinute; minute += 60) {
    marks.push(minute);
  }
  return marks;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isoDow(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

function startOfWeek(date: string): string {
  return addDays(date, 1 - isoDow(date));
}

function shiftMonth(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const last = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const safeDay = Math.min(day, last);
  const shifted = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), safeDay),
  );
  return shifted.toISOString().slice(0, 10);
}

function monthCellDates(anchorDate: string): string[] {
  const start = `${anchorDate.slice(0, 7)}-01`;
  const lead = isoDow(start) - 1;
  const first = addDays(start, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function weekRangeLabel(start: string, end: string): string {
  const startDay = Number(start.slice(8, 10));
  const endDay = Number(end.slice(8, 10));
  const startMonth = MONTHS_IT[Number(start.slice(5, 7)) - 1];
  const endMonth = MONTHS_IT[Number(end.slice(5, 7)) - 1];
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${startDay} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (startYear === endYear) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  }
  return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
}

function monthTitle(date: string): string {
  const month = MONTHS_IT[Number(date.slice(5, 7)) - 1];
  return `${month} ${date.slice(0, 4)}`;
}

function formatDayLong(date: string): string {
  const noon = `${date}T12:00:00`;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(romeLocalNoonUtc(date) ?? noon));
}

function romeLocalNoonUtc(date: string): string | null {
  try {
    return romeLocalInputToUtcIso(`${date}T12:00`);
  } catch {
    return null;
  }
}

function romeDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function useTodayRome(): string {
  const [today, setToday] = useState(todayInRome);
  useEffect(() => {
    const id = window.setInterval(() => setToday(todayInRome()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

function useNowMinute(): number {
  const [minute, setMinute] = useState(() =>
    getRomeMinutesFromMidnight(new Date().toISOString()),
  );
  useEffect(() => {
    const tick = () =>
      setMinute(getRomeMinutesFromMidnight(new Date().toISOString()));
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return minute;
}
