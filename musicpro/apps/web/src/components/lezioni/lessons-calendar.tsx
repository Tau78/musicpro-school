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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  formatEuro,
  getRomeMinutesFromMidnight,
  googleEventColorStyle,
  minutesToTimeLabel,
  romeLocalInputToUtcIso,
  todayInRome,
  type CourseKind,
  type CourseStatus,
} from "@musicpro/database";

import type { BookingCalendarLastMinuteMarker } from "@/lib/admin/booking-calendar-last-minute";

import {
  EVENT_DRAG_ARM_MS,
  EVENT_DRAG_MOVE_PX,
  LONG_PRESS_MOVE_PX,
  LONG_PRESS_MS,
  PINCH_RATIO,
  SWIPE_MIN_PX,
  SWIPE_RATIO,
  extendGridCloseMinute,
  hitTestDayColumn,
  nextCalendarView,
  prevCalendarView,
  resolvePlacedEndMinute,
  touchHorizontalSpan,
  vibrateLight,
} from "@/components/lezioni/calendar-gestures";
import {
  LessonsCalendarToolbar,
  type CalendarView,
} from "@/components/lezioni/lessons-calendar-toolbar";

export type { CalendarView };

export type MoveScope = "this" | "future";

export type MoveNotifyFlags = {
  teacher: boolean;
  family: boolean;
};

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
  bookingId?: string | null;
  source?: "lesson" | "booking" | "external";
  bookingStatus?: "pending" | "pending_approval" | "confirmed" | "cancelled";
  proviDaSolo?: boolean;
  calendarColorId?: string | null;
  placement?: "scheduled" | "da_piazzare" | "da_recuperare";
}

export interface LessonsCalendarProps {
  lessons: CalendarLesson[];
  view: CalendarView;
  /** YYYY-MM-DD (Europe/Rome). */
  anchorDate: string;
  sundayVisible: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  slotGranularityMinutes?: number;
  canDrag: boolean;
  /** Consente trascinamento eventi prenotazione (calendario sale admin). */
  canDragBookings?: boolean;
  /** Prenotazioni: conferma senza chiedere se spostare anche le successive. */
  moveSingleScope?: boolean;
  showTeacherName: boolean;
  rooms: { id: string; name: string }[];
  onMove: (
    lessonId: string,
    startsAtIso: string,
    roomId: string | null,
    scope: MoveScope,
    notify: MoveNotifyFlags,
  ) => Promise<void>;
  onOpenLesson?: (lessonId: string) => void;
  /** Doppio click su slot vuoto (solo vista settimana). */
  onSlotDoubleClick?: (date: string, startMinute: number) => void;
  /** Trascina su slot vuoto per selezionare intervallo (inizio + durata). */
  onSlotRangeSelect?: (
    date: string,
    startMinute: number,
    durationMinutes: number,
  ) => void;
  onSelectDay?: (date: string) => void;
  onViewChange?: (view: CalendarView) => void;
  onAnchorDateChange?: (date: string) => void;
  /** YYYY-MM-DD evidenziato (click da mese). */
  highlightDay?: string | null;
  /** Indicatori last minute su slot liberi (admin prenotazioni). */
  lastMinuteMarkers?: BookingCalendarLastMinuteMarker[];
}

const ROME = "Europe/Rome";
const DEFAULT_SLOT_MINUTES = 15;
const PX_PER_HOUR_FALLBACK = 32;
const PX_PER_HOUR_MIN = 20;
const PX_PER_HOUR_MAX = 48;
const DAY_HEADER_PX = 28;
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
const MONTHS_SHORT = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
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
  slotGranularityMinutes = DEFAULT_SLOT_MINUTES,
  canDrag,
  canDragBookings = false,
  moveSingleScope = false,
  showTeacherName,
  rooms,
  onMove,
  onOpenLesson,
  onSlotDoubleClick,
  onSlotRangeSelect,
  onSelectDay,
  onViewChange,
  onAnchorDateChange,
  highlightDay,
  lastMinuteMarkers,
}: LessonsCalendarProps) {
  const openMinute = Number.isFinite(gridOpenMinute) ? gridOpenMinute : 600;
  const configuredCloseMinute =
    Number.isFinite(gridCloseMinute) && gridCloseMinute > openMinute
      ? gridCloseMinute
      : 1380;
  const slotMinutes = [5, 15, 30].includes(slotGranularityMinutes)
    ? slotGranularityMinutes
    : DEFAULT_SLOT_MINUTES;

  const placed = useMemo(
    () => placeLessons(lessons, slotMinutes),
    [lessons, slotMinutes],
  );
  const weekStart = startOfWeek(anchorDate);
  const weekDays = sundayVisible ? 7 : 6;
  const weekDates = useMemo(
    () => Array.from({ length: weekDays }, (_, i) => addDays(weekStart, i)),
    [weekStart, weekDays],
  );
  const threeDayDates = useMemo(
    () => Array.from({ length: 3 }, (_, i) => addDays(anchorDate, i)),
    [anchorDate],
  );
  const dayDates = useMemo(() => [anchorDate], [anchorDate]);
  const monthDates = useMemo(() => monthCellDates(anchorDate), [anchorDate]);
  const gridDates =
    view === "day" ? dayDates : view === "3day" ? threeDayDates : weekDates;
  const isTimeGrid = view === "day" || view === "3day" || view === "week";

  const visibleLessons = useMemo(() => {
    if (isTimeGrid) {
      const set = new Set(gridDates);
      return placed.filter((lesson) => set.has(lesson.date));
    }
    const prefix = anchorDate.slice(0, 7);
    return placed.filter((lesson) => lesson.date.startsWith(prefix));
  }, [isTimeGrid, placed, gridDates, anchorDate]);

  /** Estendi la griglia se ci sono eventi oltre l’orario di chiusura (es. 22–24). */
  const closeMinute = useMemo(
    () => extendGridCloseMinute(configuredCloseMinute, visibleLessons),
    [configuredCloseMinute, visibleLessons],
  );

  const hoursLabel = formatOreLabel(
    visibleLessons.reduce((sum, lesson) => {
      return sum + Math.max(0, lesson.endMinute - lesson.startMinute);
    }, 0),
  );

  const dateLabel = isTimeGrid
    ? view === "day"
      ? formatDayLong(anchorDate)
      : weekRangeLabel(gridDates[0]!, gridDates[gridDates.length - 1]!)
    : monthTitle(anchorDate);
  const dateLabelShort = isTimeGrid
    ? view === "day"
      ? formatDayShort(anchorDate)
      : weekRangeLabelShort(gridDates[0]!, gridDates[gridDates.length - 1]!)
    : dateLabel;

  const [pending, setPending] = useState<PendingMove | null>(null);
  const [hover, setHover] = useState<HoverSlot | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragDuration, setDragDuration] = useState<number | null>(null);
  const [pointerDragLessonId, setPointerDragLessonId] = useState<string | null>(
    null,
  );
  const dragLessonRef = useRef<PlacedLesson | null>(null);
  const pointerDragActiveRef = useRef(false);
  /** Blocca swipe/pinch mentre si crea/sposta con touch. */
  const navGestureBlockedRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number; active: boolean } | null>(
    null,
  );
  const pinchStartSpanRef = useRef<number | null>(null);
  const pinchHandledRef = useRef(false);

  function goToday() {
    onAnchorDateChange?.(todayInRome());
  }

  function goPrev() {
    if (view === "day") onAnchorDateChange?.(addDays(anchorDate, -1));
    else if (view === "3day") onAnchorDateChange?.(addDays(anchorDate, -3));
    else if (view === "week") onAnchorDateChange?.(addDays(weekStart, -7));
    else onAnchorDateChange?.(shiftMonth(anchorDate, -1));
  }

  function goNext() {
    if (view === "day") onAnchorDateChange?.(addDays(anchorDate, 1));
    else if (view === "3day") onAnchorDateChange?.(addDays(anchorDate, 3));
    else if (view === "week") onAnchorDateChange?.(addDays(weekStart, 7));
    else onAnchorDateChange?.(shiftMonth(anchorDate, 1));
  }

  function handleDayClick(date: string) {
    if (onSelectDay) {
      onSelectDay(date);
      return;
    }
    onAnchorDateChange?.(date);
    onViewChange?.("day");
  }

  function beginDrag(lesson: PlacedLesson) {
    dragLessonRef.current = lesson;
    setDragDuration(Math.max(slotMinutes, lesson.endMinute - lesson.startMinute));
  }

  function endDrag() {
    dragLessonRef.current = null;
    pointerDragActiveRef.current = false;
    setPointerDragLessonId(null);
    setDragDuration(null);
    setHover(null);
    navGestureBlockedRef.current = false;
  }

  function updatePointerDragHover(clientX: number, clientY: number) {
    const lesson = dragLessonRef.current;
    if (!lesson) return;
    const hit = hitTestDayColumn(clientX, clientY);
    if (!hit) return;
    const duration = Math.max(
      slotMinutes,
      lesson.endMinute - lesson.startMinute,
    );
    const startMinute = snapMinute(
      hit.minute,
      openMinute,
      closeMinute,
      duration,
      slotMinutes,
    );
    setHover({
      date: hit.date,
      startMinute,
      durationMinutes: duration,
    });
  }

  function beginPointerDrag(lesson: PlacedLesson) {
    beginDrag(lesson);
    pointerDragActiveRef.current = true;
    setPointerDragLessonId(lesson.id);
    navGestureBlockedRef.current = true;
    vibrateLight();
  }

  function finishPointerDrag(clientX: number, clientY: number) {
    const lesson = dragLessonRef.current;
    if (!lesson || !pointerDragActiveRef.current) {
      endDrag();
      return;
    }
    const hit = hitTestDayColumn(clientX, clientY);
    if (!hit) {
      endDrag();
      return;
    }
    proposeMove(hit.date, hit.minute, lesson.id);
  }

  function proposeMove(date: string, startMinute: number, lessonId?: string) {
    const lesson =
      dragLessonRef.current ??
      (lessonId ? placed.find((row) => row.id === lessonId) : undefined);
    if (!lesson) return;
    const duration = Math.max(slotMinutes, lesson.endMinute - lesson.startMinute);
    const snapped = snapMinute(
      startMinute,
      openMinute,
      closeMinute,
      duration,
      slotMinutes,
    );
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

  async function confirmMove(scope: MoveScope, notify: MoveNotifyFlags) {
    if (!pending) return;
    setMoving(true);
    setMoveError(null);
    try {
      await onMove(
        pending.lesson.id,
        pending.startsAtIso,
        pending.roomId,
        scope,
        notify,
      );
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

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (navGestureBlockedRef.current) return;
    if (event.touches.length === 2) {
      const a = event.touches[0]!;
      const b = event.touches[1]!;
      pinchStartSpanRef.current = touchHorizontalSpan(a, b);
      pinchHandledRef.current = false;
      swipeStartRef.current = null;
      return;
    }
    if (event.touches.length === 1) {
      const t = event.touches[0]!;
      swipeStartRef.current = { x: t.clientX, y: t.clientY, active: true };
      pinchStartSpanRef.current = null;
    }
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (navGestureBlockedRef.current) return;
    if (
      event.touches.length === 2 &&
      pinchStartSpanRef.current != null &&
      !pinchHandledRef.current &&
      onViewChange
    ) {
      const span = touchHorizontalSpan(event.touches[0]!, event.touches[1]!);
      const start = pinchStartSpanRef.current;
      if (start < 24) return;
      const ratio = span / start;
      if (ratio >= PINCH_RATIO) {
        const next = nextCalendarView(view);
        if (next) {
          pinchHandledRef.current = true;
          vibrateLight();
          onViewChange(next);
        }
      } else if (ratio <= 1 / PINCH_RATIO) {
        const prev = prevCalendarView(view);
        if (prev) {
          pinchHandledRef.current = true;
          vibrateLight();
          onViewChange(prev);
        }
      }
      return;
    }
    if (event.touches.length !== 1 || !swipeStartRef.current?.active) return;
    const t = event.touches[0]!;
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx) * 0.9 && Math.abs(dy) > 24) {
      swipeStartRef.current.active = false;
    }
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length > 0) return;
    const pinchDone = pinchHandledRef.current;
    pinchStartSpanRef.current = null;
    pinchHandledRef.current = false;
    if (navGestureBlockedRef.current || pinchDone) {
      swipeStartRef.current = null;
      return;
    }
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start?.active || !onAnchorDateChange) return;
    const t = event.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  return (
    <div className="space-y-1">
      <LessonsCalendarToolbar
        view={view}
        dateLabel={dateLabel}
        dateLabelShort={dateLabelShort}
        hoursLabel={hoursLabel}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onViewChange={onViewChange}
      />

      <div
        className="overflow-hidden rounded-lg border border-neutral-200 bg-white touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          swipeStartRef.current = null;
          pinchStartSpanRef.current = null;
          pinchHandledRef.current = false;
        }}
      >
        {isTimeGrid ? (
          <WeekGrid
            dates={gridDates}
            lessons={visibleLessons}
            openMinute={openMinute}
            closeMinute={closeMinute}
            slotMinutes={slotMinutes}
            canDrag={canDrag}
            canDragBookings={canDragBookings}
            showTeacherName={showTeacherName}
            highlightDay={highlightDay}
            hover={hover}
            dragDuration={dragDuration}
            pointerDragLessonId={pointerDragLessonId}
            onHover={setHover}
            onBeginDrag={beginDrag}
            onEndDrag={endDrag}
            onBeginPointerDrag={beginPointerDrag}
            onPointerDragMove={updatePointerDragHover}
            onPointerDragEnd={finishPointerDrag}
            onProposeMove={proposeMove}
            onOpenLesson={onOpenLesson}
            onSlotDoubleClick={onSlotDoubleClick}
            onSlotRangeSelect={onSlotRangeSelect}
            onRangeGestureActiveChange={(active) => {
              navGestureBlockedRef.current = active;
            }}
            lastMinuteMarkers={lastMinuteMarkers}
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
          key={`${pending.lesson.id}:${pending.startsAtIso}`}
          pending={pending}
          rooms={rooms}
          moving={moving}
          error={moveError}
          singleScope={moveSingleScope}
          onRoomChange={(roomId) =>
            setPending((current) => (current ? { ...current, roomId } : current))
          }
          onConfirm={(scope, notify) => void confirmMove(scope, notify)}
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
  slotMinutes,
  canDrag,
  canDragBookings = false,
  showTeacherName,
  highlightDay,
  hover,
  dragDuration,
  pointerDragLessonId,
  onHover,
  onBeginDrag,
  onEndDrag,
  onBeginPointerDrag,
  onPointerDragMove,
  onPointerDragEnd,
  onProposeMove,
  onOpenLesson,
  onSlotDoubleClick,
  onSlotRangeSelect,
  onRangeGestureActiveChange,
  lastMinuteMarkers,
}: {
  dates: string[];
  lessons: PlacedLesson[];
  openMinute: number;
  closeMinute: number;
  slotMinutes: number;
  canDrag: boolean;
  canDragBookings?: boolean;
  showTeacherName: boolean;
  highlightDay?: string | null;
  hover: HoverSlot | null;
  dragDuration: number | null;
  pointerDragLessonId: string | null;
  onHover: (slot: HoverSlot | null) => void;
  onBeginDrag: (lesson: PlacedLesson) => void;
  onEndDrag: () => void;
  onBeginPointerDrag: (lesson: PlacedLesson) => void;
  onPointerDragMove: (clientX: number, clientY: number) => void;
  onPointerDragEnd: (clientX: number, clientY: number) => void;
  onProposeMove: (date: string, startMinute: number, lessonId?: string) => void;
  onOpenLesson?: (lessonId: string) => void;
  onSlotDoubleClick?: (date: string, startMinute: number) => void;
  onSlotRangeSelect?: (
    date: string,
    startMinute: number,
    durationMinutes: number,
  ) => void;
  onRangeGestureActiveChange?: (active: boolean) => void;
  lastMinuteMarkers?: BookingCalendarLastMinuteMarker[];
}) {
  const today = useTodayRome();
  const nowMinute = useNowMinute();
  const hours = Math.max(1, (closeMinute - openMinute) / 60);
  const { ref: fitRef, pxPerHour } = useFitHourHeight(hours);
  const gridHeight = hours * pxPerHour;
  const hourMarks = hourLabels(openMinute, closeMinute);
  const byDate = useMemo(() => {
    const map = new Map<string, PlacedLesson[]>();
    for (const date of dates) map.set(date, []);
    for (const lesson of lessons) {
      map.get(lesson.date)?.push(lesson);
    }
    return map;
  }, [dates, lessons]);
  const lastMinuteByDate = useMemo(() => {
    const map = new Map<string, BookingCalendarLastMinuteMarker[]>();
    if (!lastMinuteMarkers?.length) return map;
    for (const date of dates) map.set(date, []);
    for (const marker of lastMinuteMarkers) {
      map.get(marker.date)?.push(marker);
    }
    return map;
  }, [dates, lastMinuteMarkers]);

  const showNow =
    dates.includes(today) &&
    nowMinute >= openMinute &&
    nowMinute <= closeMinute;

  return (
    <div ref={fitRef} className="w-full">
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `2.5rem repeat(${dates.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="border-b border-neutral-200 bg-white" />
        {dates.map((date) => {
          const isToday = date === today;
          const isHighlight = highlightDay === date;
          return (
            <div
              key={date}
              className={`border-b border-l border-neutral-200 px-1 py-1 text-center ${
                isToday
                  ? "bg-[var(--brand)]/5"
                  : isHighlight
                    ? "bg-[var(--brand-accent)]/15"
                    : "bg-white"
              }`}
              style={{ height: DAY_HEADER_PX }}
            >
              <p
                className={`text-[10px] font-medium uppercase leading-none tracking-wide ${
                  isToday ? "text-[var(--brand)]" : "text-neutral-500"
                }`}
              >
                {DOW_SHORT[isoDow(date) - 1]}{" "}
                <span className="tabular-nums">{Number(date.slice(8, 10))}</span>
              </p>
            </div>
          );
        })}

        <div className="relative" style={{ height: gridHeight }}>
          {hourMarks.map((minute) => (
            <div
              key={minute}
              className="absolute right-0.5 -translate-y-1.5 text-[9px] tabular-nums text-neutral-400"
              style={{ top: minuteToPx(minute, openMinute, pxPerHour) }}
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
            slotMinutes={slotMinutes}
            height={gridHeight}
            pxPerHour={pxPerHour}
            hourMarks={hourMarks}
            isToday={date === today}
            isHighlight={highlightDay === date}
            showNow={showNow && date === today}
            nowMinute={nowMinute}
            canDrag={canDrag}
            canDragBookings={canDragBookings}
            showTeacherName={showTeacherName}
            hover={hover?.date === date ? hover : null}
            dragDuration={dragDuration}
            pointerDragLessonId={pointerDragLessonId}
            onHover={onHover}
            onBeginDrag={onBeginDrag}
            onEndDrag={onEndDrag}
            onBeginPointerDrag={onBeginPointerDrag}
            onPointerDragMove={onPointerDragMove}
            onPointerDragEnd={onPointerDragEnd}
            onProposeMove={onProposeMove}
            onOpenLesson={onOpenLesson}
            onSlotDoubleClick={onSlotDoubleClick}
            onSlotRangeSelect={onSlotRangeSelect}
            onRangeGestureActiveChange={onRangeGestureActiveChange}
            lastMinuteMarkers={lastMinuteByDate.get(date) ?? []}
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
  slotMinutes,
  height,
  pxPerHour,
  hourMarks,
  isToday,
  isHighlight,
  showNow,
  nowMinute,
  canDrag,
  canDragBookings = false,
  showTeacherName,
  hover,
  dragDuration,
  pointerDragLessonId,
  onHover,
  onBeginDrag,
  onEndDrag,
  onBeginPointerDrag,
  onPointerDragMove,
  onPointerDragEnd,
  onProposeMove,
  onOpenLesson,
  onSlotDoubleClick,
  onSlotRangeSelect,
  onRangeGestureActiveChange,
  lastMinuteMarkers = [],
}: {
  date: string;
  lessons: PlacedLesson[];
  openMinute: number;
  closeMinute: number;
  slotMinutes: number;
  height: number;
  pxPerHour: number;
  hourMarks: number[];
  isToday: boolean;
  isHighlight: boolean;
  showNow: boolean;
  nowMinute: number;
  canDrag: boolean;
  canDragBookings?: boolean;
  showTeacherName: boolean;
  hover: HoverSlot | null;
  dragDuration: number | null;
  pointerDragLessonId: string | null;
  onHover: (slot: HoverSlot | null) => void;
  onBeginDrag: (lesson: PlacedLesson) => void;
  onEndDrag: () => void;
  onBeginPointerDrag: (lesson: PlacedLesson) => void;
  onPointerDragMove: (clientX: number, clientY: number) => void;
  onPointerDragEnd: (clientX: number, clientY: number) => void;
  onProposeMove: (date: string, startMinute: number, lessonId?: string) => void;
  onOpenLesson?: (lessonId: string) => void;
  onSlotDoubleClick?: (date: string, startMinute: number) => void;
  onSlotRangeSelect?: (
    date: string,
    startMinute: number,
    durationMinutes: number,
  ) => void;
  onRangeGestureActiveChange?: (active: boolean) => void;
  lastMinuteMarkers?: BookingCalendarLastMinuteMarker[];
}) {
  const layouts = useMemo(() => layoutOverlaps(lessons), [lessons]);
  const columnRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
    anchorMinute: number;
  } | null>(null);
  const [rangeSelect, setRangeSelect] = useState<{
    anchorMinute: number;
    currentMinute: number;
  } | null>(null);
  const [pressArmed, setPressArmed] = useState(false);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function endRangeGesture() {
    clearLongPressTimer();
    pressStartRef.current = null;
    setPressArmed(false);
    setRangeSelect(null);
    onRangeGestureActiveChange?.(false);
  }

  function minuteFromPointer(clientY: number): number {
    const el = columnRef.current;
    if (!el) return openMinute;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top;
    return openMinute + (y / pxPerHour) * 60;
  }

  function minuteFromEvent(event: React.DragEvent<HTMLDivElement>): number {
    return minuteFromPointer(event.clientY);
  }

  function rangeFromSelection(
    anchorMinute: number,
    currentMinute: number,
  ): { startMinute: number; durationMinutes: number } {
    const rawStart = Math.min(anchorMinute, currentMinute);
    const rawEnd = Math.max(anchorMinute, currentMinute);
    const startMinute = snapMinute(
      rawStart,
      openMinute,
      closeMinute,
      slotMinutes,
      slotMinutes,
    );
    let endMinute = snapMinute(
      rawEnd,
      openMinute,
      closeMinute,
      slotMinutes,
      slotMinutes,
    );
    if (endMinute <= startMinute) {
      endMinute = startMinute + slotMinutes;
    }
    endMinute = Math.min(endMinute, closeMinute);
    return {
      startMinute,
      durationMinutes: Math.max(slotMinutes, endMinute - startMinute),
    };
  }

  const rangePreview = rangeSelect
    ? rangeFromSelection(rangeSelect.anchorMinute, rangeSelect.currentMinute)
    : null;

  return (
    <div
      ref={columnRef}
      data-day-column
      data-date={date}
      data-open-minute={openMinute}
      data-close-minute={closeMinute}
      className={`relative border-l border-neutral-200 ${
        isToday
          ? "bg-[var(--brand)]/[0.03]"
          : isHighlight
            ? "bg-[var(--brand-accent)]/[0.08]"
            : ""
      } ${rangeSelect || pressArmed ? "select-none touch-none" : ""}`}
      style={{ height }}
      onPointerDown={(event) => {
        if (!onSlotRangeSelect || event.button !== 0) return;
        if (pointerDragLessonId) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-lesson-card]")) return;
        const anchorMinute = minuteFromPointer(event.clientY);
        pressStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
          anchorMinute,
        };
        setPressArmed(true);
        clearLongPressTimer();
        // Mouse: parte subito il range al primo movimento (sotto).
        // Touch: long-press arma lo slot; oppure touch+trascina (vedi onPointerMove).
        longPressTimerRef.current = window.setTimeout(() => {
          const press = pressStartRef.current;
          if (!press || press.pointerId !== event.pointerId) return;
          vibrateLight();
          onRangeGestureActiveChange?.(true);
          setRangeSelect({
            anchorMinute: press.anchorMinute,
            currentMinute: press.anchorMinute,
          });
          columnRef.current?.setPointerCapture(event.pointerId);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        const press = pressStartRef.current;
        if (!press || press.pointerId !== event.pointerId) return;

        if (!rangeSelect) {
          const dx = event.clientX - press.x;
          const dy = event.clientY - press.y;
          const moved = Math.hypot(dx, dy);
          if (moved > LONG_PRESS_MOVE_PX) {
            // Touch/mouse + trascina su vuoto → crea range (non annullare).
            // Preferisci gesto verticale; se è quasi solo swipe orizzontale, lascia al nav.
            if (Math.abs(dy) < Math.abs(dx) * 0.85) {
              endRangeGesture();
              return;
            }
            clearLongPressTimer();
            vibrateLight();
            onRangeGestureActiveChange?.(true);
            setRangeSelect({
              anchorMinute: press.anchorMinute,
              currentMinute: minuteFromPointer(event.clientY),
            });
            columnRef.current?.setPointerCapture(event.pointerId);
          }
          return;
        }

        setRangeSelect((current) =>
          current
            ? { ...current, currentMinute: minuteFromPointer(event.clientY) }
            : current,
        );
      }}
      onPointerUp={(event) => {
        const press = pressStartRef.current;
        if (!press || press.pointerId !== event.pointerId) return;

        if (!rangeSelect || !onSlotRangeSelect) {
          endRangeGesture();
          return;
        }

        const currentMinute = minuteFromPointer(event.clientY);
        const { startMinute, durationMinutes } = rangeFromSelection(
          rangeSelect.anchorMinute,
          currentMinute,
        );
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        endRangeGesture();
        onSlotRangeSelect(date, startMinute, durationMinutes);
      }}
      onPointerCancel={() => endRangeGesture()}
      onDragOver={(event) => {
        if ((!canDrag && !canDragBookings) || rangeSelect) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const duration = dragDuration ?? 60;
        const startMinute = snapMinute(
          minuteFromEvent(event),
          openMinute,
          closeMinute,
          duration,
          slotMinutes,
        );
        onHover({ date, startMinute, durationMinutes: duration });
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        onHover(null);
      }}
      onDrop={(event) => {
        if (!canDrag && !canDragBookings) return;
        event.preventDefault();
        const lessonId =
          event.dataTransfer.getData(DRAG_MIME) ||
          event.dataTransfer.getData("text/plain");
        onProposeMove(date, minuteFromEvent(event), lessonId || undefined);
      }}
      onDoubleClick={(event) => {
        if (!onSlotDoubleClick || rangeSelect) return;
        if ((event.target as HTMLElement).closest("[data-lesson-card]")) return;
        const startMinute = snapMinute(
          minuteFromPointer(event.clientY),
          openMinute,
          closeMinute,
          slotMinutes,
          slotMinutes,
        );
        onSlotDoubleClick(date, startMinute);
      }}
    >
      {hourMarks.map((minute) => (
        <div
          key={minute}
          className="pointer-events-none absolute inset-x-0 border-t border-neutral-100"
          style={{ top: minuteToPx(minute, openMinute, pxPerHour) }}
        />
      ))}

      {pressArmed && !rangePreview ? (
        <div
          className="pointer-events-none absolute inset-x-1 z-[4] rounded-sm border border-dashed border-[var(--brand)]/50 bg-[var(--brand)]/5"
          style={{
            top: minuteToPx(
              snapMinute(
                pressStartRef.current?.anchorMinute ?? openMinute,
                openMinute,
                closeMinute,
                slotMinutes,
                slotMinutes,
              ),
              openMinute,
              pxPerHour,
            ),
            height: Math.max(12, (slotMinutes / 60) * pxPerHour),
          }}
          aria-hidden
        />
      ) : null}

      {lastMinuteMarkers.map((marker) => {
        const top = minuteToPx(marker.startMinute, openMinute, pxPerHour);
        const heightPx = Math.max(
          14,
          (marker.durationMinutes / 60) * pxPerHour,
        );
        return (
          <div
            key={`lm-${marker.startMinute}-${marker.durationMinutes}`}
            className="pointer-events-none absolute inset-x-0.5 z-[2] rounded-sm border border-rose-200/70 bg-rose-50/40"
            style={{ top, height: heightPx }}
            title={
              marker.phase === 2 && marker.finalPriceEur != null
                ? `Last minute ${formatEuro(marker.finalPriceEur)}`
                : "Last minute"
            }
          >
            <div className="absolute right-0 top-0 max-w-full truncate px-0.5 pt-px leading-none">
              {marker.phase === 1 ? (
                <span className="text-[9px] font-medium text-rose-800/90">
                  Last minute
                </span>
              ) : marker.finalPriceEur != null ? (
                <span className="text-[9px] font-semibold tabular-nums text-rose-800">
                  {formatEuro(marker.finalPriceEur)}
                </span>
              ) : (
                <span className="text-[9px] font-medium text-rose-800/90">
                  LM
                </span>
              )}
            </div>
          </div>
        );
      })}

      {rangePreview ? (
        <div
          className="pointer-events-none absolute inset-x-0.5 z-[5] rounded-sm border border-[var(--brand)] bg-[var(--brand)]/15"
          style={{
            top: minuteToPx(rangePreview.startMinute, openMinute, pxPerHour),
            height: Math.max(
              10,
              (rangePreview.durationMinutes / 60) * pxPerHour,
            ),
          }}
        />
      ) : null}

      {hover && !rangePreview ? (
        <div
          className="pointer-events-none absolute inset-x-0.5 rounded-sm border border-dashed border-[var(--brand)] bg-[var(--brand)]/10"
          style={{
            top: minuteToPx(hover.startMinute, openMinute, pxPerHour),
            height: Math.max(
              10,
              (hover.durationMinutes / 60) * pxPerHour,
            ),
          }}
        />
      ) : null}

      {layouts.map(({ lesson, col, cols }) => {
        const top = minuteToPx(lesson.startMinute, openMinute, pxPerHour);
        const rawHeight =
          ((lesson.endMinute - lesson.startMinute) / 60) * pxPerHour;
        const heightPx = Math.max(16, rawHeight);
        const widthPct = 100 / cols;
        return (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            canDrag={canDrag}
            canDragBookings={canDragBookings}
            showTeacherName={showTeacherName}
            isPointerDragging={pointerDragLessonId === lesson.id}
            style={{
              top,
              height: heightPx,
              left: `calc(${col * widthPct}% + 0.2rem)`,
              width: `calc(${widthPct}% - 0.4rem)`,
            }}
            onBeginDrag={onBeginDrag}
            onEndDrag={onEndDrag}
            onBeginPointerDrag={onBeginPointerDrag}
            onPointerDragMove={onPointerDragMove}
            onPointerDragEnd={onPointerDragEnd}
            onOpenLesson={onOpenLesson}
          />
        );
      })}

      {showNow ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 border-t border-red-500"
          style={{ top: minuteToPx(nowMinute, openMinute, pxPerHour) }}
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
  canDragBookings,
  showTeacherName,
  isPointerDragging,
  style,
  onBeginDrag,
  onEndDrag,
  onBeginPointerDrag,
  onPointerDragMove,
  onPointerDragEnd,
  onOpenLesson,
}: {
  lesson: PlacedLesson;
  canDrag: boolean;
  canDragBookings: boolean;
  showTeacherName: boolean;
  isPointerDragging: boolean;
  style: React.CSSProperties;
  onBeginDrag: (lesson: PlacedLesson) => void;
  onEndDrag: () => void;
  onBeginPointerDrag: (lesson: PlacedLesson) => void;
  onPointerDragMove: (clientX: number, clientY: number) => void;
  onPointerDragEnd: (clientX: number, clientY: number) => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const dragged = useRef(false);
  const pointerDragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    armed: boolean;
    active: boolean;
    timer: number | null;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const teacher = teacherLabel(lesson);
  const title = lessonTitle(lesson);
  const time = `${minutesToTimeLabel(lesson.startMinute)}–${minutesToTimeLabel(lesson.endMinute)}`;
  const isHold = lesson.id.startsWith("hold:");
  const isBooking = isCalendarBooking(lesson);
  const isExternal = isCalendarExternal(lesson);
  // Prenotazioni: basta canDragBookings (calendario sale ha canDrag=false sulle lezioni).
  // Lezioni didattiche: serve canDrag + corso attivo senza presenza.
  const draggable =
    !isHold &&
    !isExternal &&
    (isBooking
      ? canDragBookings
      : canDrag &&
        !lesson.hasAttendance &&
        lesson.courseStatus === "attivo");

  useEffect(() => {
    return () => {
      const press = pointerDragRef.current;
      if (press?.timer != null) window.clearTimeout(press.timer);
    };
  }, []);

  function clearPointerDragTimer() {
    const press = pointerDragRef.current;
    if (press?.timer != null) {
      window.clearTimeout(press.timer);
      press.timer = null;
    }
  }

  function endPointerPress() {
    clearPointerDragTimer();
    pointerDragRef.current = null;
  }

  function open() {
    if (dragged.current || isPointerDragging) return;
    onOpenLesson?.(lesson.id);
  }

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      data-lesson-card
      draggable={draggable}
      title={`${title} · ${time}${lesson.roomName ? ` · ${lesson.roomName}` : ""}`}
      onPointerDown={(event) => {
        if (!draggable || event.button !== 0) return;
        // Mouse: HTML5 DnD. Touch/pen: long-press poi trascina.
        if (event.pointerType === "mouse") return;
        event.stopPropagation();
        clearPointerDragTimer();
        const pointerId = event.pointerId;
        pointerDragRef.current = {
          pointerId,
          x: event.clientX,
          y: event.clientY,
          armed: false,
          active: false,
          timer: window.setTimeout(() => {
            const press = pointerDragRef.current;
            if (!press || press.pointerId !== pointerId) return;
            press.armed = true;
            press.active = true;
            dragged.current = true;
            onBeginPointerDrag(lesson);
            cardRef.current?.setPointerCapture(pointerId);
          }, EVENT_DRAG_ARM_MS),
        };
      }}
      onPointerMove={(event) => {
        const press = pointerDragRef.current;
        if (!press || press.pointerId !== event.pointerId) return;
        if (press.active) {
          event.preventDefault();
          onPointerDragMove(event.clientX, event.clientY);
          return;
        }
        const moved = Math.hypot(
          event.clientX - press.x,
          event.clientY - press.y,
        );
        if (moved > EVENT_DRAG_MOVE_PX) {
          // Scroll/gesto nav: non armare lo spostamento.
          endPointerPress();
        }
      }}
      onContextMenu={(event) => {
        // Long-press iOS/Android: niente menu Copia/Traduci sulla card.
        if (draggable) event.preventDefault();
      }}
      onPointerUp={(event) => {
        const press = pointerDragRef.current;
        if (!press || press.pointerId !== event.pointerId) return;
        if (press.active) {
          if (cardRef.current?.hasPointerCapture(event.pointerId)) {
            cardRef.current.releasePointerCapture(event.pointerId);
          }
          onPointerDragEnd(event.clientX, event.clientY);
          endPointerPress();
          window.setTimeout(() => {
            dragged.current = false;
          }, 0);
          return;
        }
        endPointerPress();
      }}
      onPointerCancel={() => {
        if (pointerDragRef.current?.active) {
          onEndDrag();
        }
        endPointerPress();
        dragged.current = false;
      }}
      onDragStart={(event) => {
        if (!draggable) {
          event.preventDefault();
          return;
        }
        // Evita HTML5 DnD durante un drag touch già attivo.
        if (pointerDragRef.current?.active) {
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
      onDoubleClick={(event) => {
        event.stopPropagation();
        open();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className={`absolute z-10 overflow-hidden rounded-sm border px-1 py-px text-left leading-tight select-none ${lessonCardClass(lesson)} ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${lesson.hasAttendance && !isHold ? "opacity-80" : ""} ${
        isPointerDragging ? "opacity-40 touch-none z-30" : ""
      }`}
      style={{
        ...style,
        ...calendarColorCss(lesson),
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <p className="pointer-events-none truncate text-[10px] font-semibold text-neutral-900">
        {title}
      </p>
      <p className="pointer-events-none truncate text-[9px] tabular-nums text-neutral-700">
        {time}
        {lesson.roomName ? ` · ${lesson.roomName}` : ""}
      </p>
      {showTeacherName && teacher ? (
        <p className="pointer-events-none truncate text-[9px] text-neutral-600">
          {teacher}
        </p>
      ) : null}
      {isBooking ? (
        <p className="pointer-events-none truncate text-[9px] font-medium text-neutral-600">
          {bookingChipLabel(lesson)}
        </p>
      ) : null}
      {isExternal ? (
        <p className="pointer-events-none truncate text-[9px] font-medium text-neutral-600">
          Calendario
        </p>
      ) : null}
      {lesson.hasAttendance && !isHold && !isBooking ? (
        <p className="pointer-events-none truncate text-[9px] font-medium uppercase tracking-wide text-neutral-500">
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
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-white">
        {DOW_SHORT.map((label) => (
          <div
            key={label}
            className="px-1 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-neutral-500"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const inMonth = date.startsWith(monthPrefix);
          const dayLessons = byDate.get(date) ?? [];
          const extra = Math.max(0, dayLessons.length - 2);
          const isToday = date === today;
          const isHighlight = highlightDay === date;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(date)}
              className={`min-h-[4.5rem] border-b border-r border-neutral-100 px-1 py-1 text-left align-top last:border-r-0 hover:bg-neutral-50 ${
                inMonth ? "bg-white" : "bg-neutral-50/80"
              } ${isHighlight && !isToday ? "bg-[var(--brand-accent)]/10" : ""}`}
            >
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
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
              <ul className="mt-0.5 space-y-px">
                {dayLessons.slice(0, 2).map((lesson) => (
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
                      style={calendarColorCss(lesson)}
                    >
                      {lessonTitle(lesson)}
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
  singleScope,
  onRoomChange,
  onConfirm,
  onClose,
}: {
  pending: PendingMove;
  rooms: { id: string; name: string }[];
  moving: boolean;
  error: string | null;
  singleScope?: boolean;
  onRoomChange: (roomId: string | null) => void;
  onConfirm: (scope: MoveScope, notify: MoveNotifyFlags) => void;
  onClose: () => void;
}) {
  const [notifyTeacher, setNotifyTeacher] = useState(true);
  const [notifyFamily, setNotifyFamily] = useState(true);
  const online = pending.lesson.courseKind === "online";
  const isBooking = isCalendarBooking(pending.lesson);
  const notify: MoveNotifyFlags = isBooking
    ? { teacher: false, family: false }
    : { teacher: notifyTeacher, family: notifyFamily };
  const seriesMove =
    !singleScope &&
    !isBooking &&
    pending.lesson.courseStatus === "attivo";
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
    <div className="fixed inset-0 z-50 box-border flex h-[100dvh] max-h-[100dvh] w-full max-w-full items-end justify-center overflow-hidden bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-lesson-title"
        className="w-full min-w-0 max-w-md overflow-x-clip overflow-y-auto rounded-xl bg-white p-4 shadow-lg sm:p-6"
      >
        <h3
          id="move-lesson-title"
          className="text-lg font-semibold text-[var(--brand)]"
        >
          {isBooking ? "Sposta prenotazione" : "Sposta lezione"}
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

        {seriesMove ? (
          <p className="mt-4 text-sm font-medium text-neutral-800">
            Sposto solo questa o tutte le successive?
          </p>
        ) : null}

        {!isBooking ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <label className="inline-flex items-center gap-1.5 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={notifyTeacher}
                disabled={moving}
                onChange={(event) => setNotifyTeacher(event.target.checked)}
              />
              Avvisa il docente
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={notifyFamily}
                disabled={moving}
                onChange={(event) => setNotifyFamily(event.target.checked)}
              />
              Avvisa l&apos;allievo/tutore
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
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
            onClick={() => onConfirm("this", notify)}
            className={
              seriesMove
                ? "rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-50"
                : "rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            }
          >
            {moving
              ? "Spostamento…"
              : seriesMove
                ? "Solo questa"
                : "Conferma spostamento"}
          </button>
          {seriesMove ? (
            <button
              type="button"
              disabled={moving}
              onClick={() => onConfirm("future", notify)}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {moving ? "Spostamento…" : "Tutte le successive"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function placeLessons(
  lessons: CalendarLesson[],
  slotMinutes: number,
): PlacedLesson[] {
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
      endMinute: resolvePlacedEndMinute(startMinute, endMinute, slotMinutes),
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

function isCalendarBooking(lesson: CalendarLesson): boolean {
  return lesson.source === "booking" || lesson.id.startsWith("booking:");
}

function isCalendarExternal(lesson: CalendarLesson): boolean {
  return lesson.source === "external" || lesson.id.startsWith("external:");
}

function bookingChipLabel(lesson: CalendarLesson): string {
  if (lesson.bookingStatus === "pending_approval") return "Da approvare";
  if (lesson.proviDaSolo) return "Da solo";
  return "Sala";
}

function calendarColorCss(
  lesson: CalendarLesson,
): { backgroundColor: string; borderColor: string } | undefined {
  const colors = googleEventColorStyle(lesson.calendarColorId);
  if (!colors) return undefined;
  return { backgroundColor: colors.bg, borderColor: colors.border };
}

function lessonCardClass(lesson: CalendarLesson): string {
  if (isCalendarExternal(lesson)) {
    return lesson.calendarColorId
      ? "border"
      : "bg-neutral-100 border-neutral-400";
  }
  if (isCalendarBooking(lesson)) {
    if (lesson.bookingStatus === "pending_approval") {
      return lesson.calendarColorId
        ? "border border-dashed"
        : "bg-emerald-50 border-dashed border-emerald-400";
    }
    return lesson.calendarColorId
      ? "border"
      : "bg-emerald-100 border-emerald-300";
  }
  const dashed =
    lesson.courseStatus === "in_attesa" || lesson.placement === "da_piazzare"
      ? "border-dashed border-amber-400"
      : "";
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
  if (isCalendarBooking(lesson) || isCalendarExternal(lesson)) {
    return chipName(lesson);
  }
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

function minuteToPx(
  minute: number,
  openMinute: number,
  pxPerHour: number,
): number {
  return ((minute - openMinute) / 60) * pxPerHour;
}

function snapMinute(
  minute: number,
  openMinute: number,
  closeMinute: number,
  duration: number,
  slotMinutes: number,
): number {
  const step = slotMinutes > 0 ? slotMinutes : DEFAULT_SLOT_MINUTES;
  const snapped = Math.round(minute / step) * step;
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
  const startMonth = MONTHS_SHORT[Number(start.slice(5, 7)) - 1];
  const endMonth = MONTHS_SHORT[Number(end.slice(5, 7)) - 1];
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${startDay} ${endMonth} ${endYear} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (startYear === endYear) {
    return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  }
  return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
}

/** Range compatto per toolbar mobile (es. «21–26 set 2026»). */
function weekRangeLabelShort(start: string, end: string): string {
  const startDay = Number(start.slice(8, 10));
  const endDay = Number(end.slice(8, 10));
  const startMonth = MONTHS_SHORT[Number(start.slice(5, 7)) - 1]!.toLowerCase();
  const endMonth = MONTHS_SHORT[Number(end.slice(5, 7)) - 1]!.toLowerCase();
  const year = end.slice(0, 4);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${startDay}–${endDay} ${endMonth} ${year}`;
  }
  if (start.slice(0, 4) === end.slice(0, 4)) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
  }
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
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

function formatDayShort(date: string): string {
  const day = Number(date.slice(8, 10));
  const month = MONTHS_SHORT[Number(date.slice(5, 7)) - 1];
  const dow = DOW_SHORT[isoDow(date) - 1];
  return `${dow} ${day} ${month}`;
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

function useFitHourHeight(hours: number): {
  ref: React.RefObject<HTMLDivElement>;
  pxPerHour: number;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [pxPerHour, setPxPerHour] = useState(PX_PER_HOUR_FALLBACK);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      const node = ref.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      const available = window.innerHeight - top - 12 - DAY_HEADER_PX;
      if (available <= 0 || hours <= 0) return;
      setPxPerHour(
        clamp(available / hours, PX_PER_HOUR_MIN, PX_PER_HOUR_MAX),
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hours]);

  return { ref, pxPerHour };
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
