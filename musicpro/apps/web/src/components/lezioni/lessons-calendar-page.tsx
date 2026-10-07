"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  getCurrentMemberWithRoles,
  listBookingsInRange,
  listExternalCalendarEventsInRange,
  listLessonsInRange,
  moveLesson,
  requestLessonMove,
  adminUpdateBooking,
  minutesToTimeLabel,
  romeLocalInputToUtcIso,
  utcIsoToRomeLocalInput,
  type Room,
} from "@musicpro/database";

import {
  BookingCalendarDialog,
  type BookingCalendarDraft,
} from "@/components/admin/booking-calendar-dialog";
import { requestBookingCalendarSync } from "@/lib/calendar/sync-booking";
import { requestBookingConfirmationEmail } from "@/lib/booking/send-confirmation-email";

import {
  mergeCalendarEvents,
  parseBookingId,
  parseExternalEventId,
  resolveBookingIdFromCalendarEvent,
} from "@/components/lezioni/calendar-bookings";
import { LessonAttendancePanel } from "@/components/lezioni/lesson-attendance-panel";
import {
  LessonsCalendar,
  type CalendarLesson,
  type CalendarView,
  type MoveScope,
} from "@/components/lezioni/lessons-calendar";
import { lessonCourseId } from "@/components/lezioni/lessons-oggi";
import { calendarBounds } from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/client";

export type CalendarMode = "docente" | "sala";
export type CalendarScope = "tutto" | "lezioni" | "prenotazioni";

export interface LessonsCalendarPageProps {
  initialLessons: CalendarLesson[];
  initialOggiLessons?: CalendarLesson[];
  settings: {
    sundayVisible: boolean;
    gridOpenMinute: number;
    gridCloseMinute: number;
    slotGranularityMinutes?: number;
  };
  rooms: { id: string; name: string }[];
  /** Sale complete per modifica/creazione prenotazioni (solo bookingsOnly). */
  bookingRooms?: Room[];
  teachers?: { id: string; label: string }[];
  initialTeacherId?: string | null;
  initialRoomId?: string | null;
  initialView?: CalendarView;
  initialDate?: string;
  initialMode?: CalendarMode;
  isStaff: boolean;
  canDrag: boolean;
  courseDetailBasePath: string;
  today: string;
  highlightDay?: string | null;
  memberId?: string;
  /** Solo prenotazioni sale (+ calendari esterni), senza lezioni didattiche. */
  bookingsOnly?: boolean;
  /** Filtri Tutto / Lezioni / Prenotazioni + sala e docente insieme. */
  filterLayout?: "legacy" | "unified";
  initialScope?: CalendarScope;
  /** Ambiti selezionabili (default: tutti e tre). */
  availableScopes?: readonly CalendarScope[];
  /** Docente fisso (es. dashboard docente). */
  lockTeacherId?: string | null;
}

type RequestForm = {
  lesson: CalendarLesson;
  startsLocal: string;
  roomId: string;
  note: string;
};

export function LessonsCalendarPage({
  initialLessons,
  settings,
  rooms,
  teachers = [],
  initialTeacherId = null,
  initialRoomId = null,
  initialView = "week",
  initialDate,
  initialMode = "docente",
  isStaff,
  canDrag,
  courseDetailBasePath,
  today,
  highlightDay = null,
  memberId,
  bookingsOnly = false,
  bookingRooms = [],
  filterLayout = "legacy",
  initialScope = "tutto",
  availableScopes = ["tutto", "lezioni", "prenotazioni"],
  lockTeacherId = null,
}: LessonsCalendarPageProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fetchGen = useRef(0);

  const [view, setView] = useState<CalendarView>(initialView);
  const [anchorDate, setAnchorDate] = useState(
    initialDate && isIsoDate(initialDate) ? initialDate : today,
  );
  const [teacherId, setTeacherId] = useState(
    lockTeacherId ?? initialTeacherId ?? "",
  );
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [mode, setMode] = useState<CalendarMode>(
    bookingsOnly ? "sala" : initialMode,
  );
  const [scope, setScope] = useState<CalendarScope>(
    bookingsOnly ? "prenotazioni" : initialScope,
  );
  const unified = filterLayout === "unified" && !bookingsOnly;
  const scopeOptions = useMemo(
    () =>
      availableScopes.filter((entry) =>
        bookingsOnly ? entry === "prenotazioni" : true,
      ),
    [availableScopes, bookingsOnly],
  );
  const [highlight, setHighlight] = useState<string | null>(highlightDay);
  const [lessons, setLessons] = useState(initialLessons);
  const [lessonsBusy, setLessonsBusy] = useState(false);

  const [requestForm, setRequestForm] = useState<RequestForm | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [actionLesson, setActionLesson] = useState<CalendarLesson | null>(null);
  const [attendanceLesson, setAttendanceLesson] =
    useState<CalendarLesson | null>(null);
  const [bookingDialog, setBookingDialog] = useState<
    | { mode: "create"; draft: BookingCalendarDraft }
    | { mode: "edit"; bookingId: string }
    | {
        mode: "external";
        external: {
          title: string;
          roomName: string | null;
          startsAt: string;
          endsAt: string;
        };
      }
    | null
  >(null);

  const sundayVisible = settings.sundayVisible;
  const filtersRef = useRef({
    view,
    anchorDate,
    mode,
    teacherId,
    roomId,
    scope,
  });
  filtersRef.current = {
    view,
    anchorDate,
    mode,
    teacherId,
    roomId,
    scope,
  };

  const loadLessons = useCallback(
    async (next: {
      view: CalendarView;
      date: string;
      mode: CalendarMode;
      teacherId: string;
      roomId: string;
      scope: CalendarScope;
    }) => {
      const gen = ++fetchGen.current;
      setLessonsBusy(true);
      const bounds = calendarBounds(next.view, next.date, sundayVisible);
      try {
        const effectiveScope = bookingsOnly ? "prenotazioni" : next.scope;
        const includeLessons =
          !bookingsOnly &&
          (effectiveScope === "tutto" || effectiveScope === "lezioni");
        const includeBookings =
          isStaff &&
          (bookingsOnly ||
            effectiveScope === "tutto" ||
            effectiveScope === "prenotazioni");

        const roomFilter = isStaff && next.roomId ? next.roomId : undefined;
        const teacherFilter =
          lockTeacherId ??
          (isStaff && next.teacherId ? next.teacherId : undefined);

        const rows = includeLessons
          ? await listLessonsInRange(supabase, {
              from: bounds.from,
              to: bounds.to,
              includePendingHold: true,
              titularMemberId:
                unified || next.mode === "docente"
                  ? teacherFilter
                  : undefined,
              teacherMemberId: isStaff ? undefined : memberId,
              roomId:
                unified || bookingsOnly || next.mode === "sala"
                  ? roomFilter
                  : undefined,
            })
          : [];
        const bookings = includeBookings
          ? await listBookingsInRange(supabase, {
              from: bounds.from,
              to: bounds.to,
              roomId: roomFilter,
            })
          : [];
        const externals = includeBookings
          ? await listExternalCalendarEventsInRange(supabase, {
              from: bounds.from,
              to: bounds.to,
              roomId: roomFilter,
            })
          : [];
        if (gen !== fetchGen.current) return;
        setLessons(mergeCalendarEvents(rows, bookings, externals));
      } catch {
        if (gen !== fetchGen.current) return;
      } finally {
        if (gen === fetchGen.current) setLessonsBusy(false);
      }
    },
    [
      bookingsOnly,
      isStaff,
      lockTeacherId,
      memberId,
      supabase,
      sundayVisible,
      unified,
    ],
  );

  function reloadLessons() {
    const current = filtersRef.current;
    return loadLessons({
      view: current.view,
      date: current.anchorDate,
      mode: current.mode,
      teacherId: current.teacherId,
      roomId: current.roomId,
      scope: current.scope,
    });
  }

  function pushQuery(next: {
    view?: CalendarView;
    date?: string;
    hl?: string | null;
    docente?: string | null;
    sala?: string | null;
    modo?: CalendarMode;
    ambito?: CalendarScope;
  }) {
    const nextView = next.view ?? view;
    const nextDate = next.date ?? anchorDate;
    const nextHl = next.hl === undefined ? highlight : next.hl;
    const nextMode = bookingsOnly ? "sala" : (next.modo ?? mode);
    const nextScope = bookingsOnly
      ? "prenotazioni"
      : (next.ambito ?? scope);
    const nextTeacher = lockTeacherId
      ? lockTeacherId
      : next.docente === undefined
        ? teacherId
        : (next.docente ?? "");
    const nextRoom = next.sala === undefined ? roomId : (next.sala ?? "");

    setView(nextView);
    setAnchorDate(nextDate);
    setHighlight(nextHl);
    setMode(nextMode);
    setScope(nextScope);
    setTeacherId(nextTeacher);
    setRoomId(nextRoom);

    const params = new URLSearchParams();
    params.set("view", nextView);
    params.set("date", nextDate);
    if (nextHl) params.set("hl", nextHl);
    if (isStaff) {
      if (unified) {
        params.set("ambito", nextScope);
        if (nextTeacher && !lockTeacherId) {
          params.set("docente", nextTeacher);
        }
        if (nextRoom) params.set("sala", nextRoom);
      } else {
        if (!bookingsOnly) {
          params.set("modo", nextMode);
        }
        if (!bookingsOnly && nextMode === "docente" && nextTeacher) {
          params.set("docente", nextTeacher);
        }
        if ((bookingsOnly || nextMode === "sala") && nextRoom) {
          params.set("sala", nextRoom);
        }
      }
    }

    const query = params.toString();
    const nextUrl = query
      ? `${window.location.pathname}?${query}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
    void loadLessons({
      view: nextView,
      date: nextDate,
      mode: nextMode,
      teacherId: nextTeacher,
      roomId: nextRoom,
      scope: nextScope,
    });
  }

  const scopeIncludesBookings =
    bookingsOnly || scope === "prenotazioni" || scope === "tutto";
  const scopeIncludesLessons =
    !bookingsOnly && (scope === "lezioni" || scope === "tutto");

  const canManageBookingEvents =
    scopeIncludesBookings && isStaff && bookingRooms.length > 0;

  function openCourse(lesson: CalendarLesson) {
    router.push(`${courseDetailBasePath}/${lessonCourseId(lesson)}`);
  }

  function handleOpenLesson(lessonId: string) {
    const lesson = lessons.find((row) => row.id === lessonId);
    const bookingId = resolveBookingIdFromCalendarEvent(lessonId, lesson);
    if (bookingId) {
      if (canManageBookingEvents) {
        setAttendanceLesson(null);
        setActionLesson(null);
        setBookingDialog({ mode: "edit", bookingId });
      } else {
        router.push(`/admin/prenotazioni/${bookingId}`);
      }
      return;
    }
    const externalId = parseExternalEventId(lessonId);
    if (externalId) {
      if (canManageBookingEvents) {
        setAttendanceLesson(null);
        setActionLesson(null);
        if (lesson?.startsAt && lesson.endsAt) {
          setBookingDialog({
            mode: "external",
            external: {
              title: lesson.courseName,
              roomName: lesson.roomName,
              startsAt: lesson.startsAt,
              endsAt: lesson.endsAt,
            },
          });
        }
      }
      return;
    }
    if (!lesson) return;
    const hold = lessonId.startsWith("hold:");
    if (!hold && memberId) {
      setActionLesson(null);
      setAttendanceLesson((current) =>
        current?.id === lesson.id ? null : lesson,
      );
      return;
    }
    if (!canDrag && !hold) {
      setActionLesson(lesson);
      return;
    }
    openCourse(lesson);
  }

  function beginRequest(lesson: CalendarLesson) {
    setActionLesson(null);
    setRequestError(null);
    setRequestForm({
      lesson,
      startsLocal: lesson.startsAt
        ? utcIsoToRomeLocalInput(lesson.startsAt)
        : `${today}T10:00`,
      roomId: lesson.roomId ?? "",
      note: "",
    });
  }

  function openCreateBooking(
    date: string,
    startMinute: number,
    durationMinutes?: number,
  ) {
    const catalog = bookingRooms.length > 0 ? bookingRooms : [];
    const defaultRoom = roomId || catalog[0]?.id || rooms[0]?.id || "";
    const selected =
      catalog.find((room) => room.id === defaultRoom) ?? catalog[0];
    const duration =
      durationMinutes ??
      selected?.default_duration_minutes ??
      settings.slotGranularityMinutes ??
      120;
    setBookingDialog({
      mode: "create",
      draft: {
        roomId: defaultRoom,
        startLocal: `${date}T${minutesToTimeLabel(startMinute)}`,
        durationMinutes: duration,
      },
    });
  }

  async function handleMove(
    lessonId: string,
    startsAtIso: string,
    nextRoomId: string | null,
    scope: MoveScope,
  ) {
    const bookingId = parseBookingId(lessonId);
    if (bookingId && canManageBookingEvents) {
      const lesson = lessons.find((row) => row.id === lessonId);
      if (!lesson?.startsAt || !lesson.endsAt) {
        throw new Error("Prenotazione non valida.");
      }
      const durationMinutes = Math.max(
        15,
        Math.round(
          (new Date(lesson.endsAt).getTime() -
            new Date(lesson.startsAt).getTime()) /
            60_000,
        ),
      );
      const endAt = new Date(
        new Date(startsAtIso).getTime() + durationMinutes * 60_000,
      ).toISOString();
      const result = await adminUpdateBooking(supabase, bookingId, {
        roomId: nextRoomId ?? lesson.roomId ?? rooms[0]?.id ?? "",
        startAt: startsAtIso,
        endAt,
      });
      if (!result.success) {
        throw new Error(result.errorMessage || "Impossibile spostare la prenotazione.");
      }
      void requestBookingCalendarSync(bookingId);
      void requestBookingConfirmationEmail(bookingId, { template: "modified" });
      await reloadLessons();
      return;
    }

    if (bookingId || parseExternalEventId(lessonId)) return;
    const lesson = lessons.find((row) => row.id === lessonId);
    if (lesson?.hasAttendance) {
      throw new Error(
        "Lezione già presenziata: sblocca la presenza prima di spostarla.",
      );
    }

    if (!memberId) {
      throw new Error("Impossibile identificare l'operatore.");
    }
    const result = await moveLesson(supabase, lessonId, {
      startsAt: startsAtIso,
      roomId: nextRoomId,
      scope,
      actor: {
        memberId,
        isStaff,
        canReschedule: canDrag,
      },
    });
    if (!result.success) {
      throw new Error(result.errorMessage || "Impossibile spostare la lezione.");
    }
    if (result.warnings?.length) {
      window.alert(result.warnings.join("\n"));
    }
    await reloadLessons();
  }

  async function submitRequest(scope: MoveScope) {
    if (!requestForm) return;
    setRequestBusy(true);
    setRequestError(null);
    try {
      let startsAt: string;
      try {
        startsAt = romeLocalInputToUtcIso(requestForm.startsLocal);
      } catch {
        setRequestError("Data e ora della lezione non valide.");
        return;
      }

      let createdBy = memberId ?? "";
      if (!createdBy) {
        const member = await getCurrentMemberWithRoles(supabase);
        createdBy = member?.id ?? "";
      }
      if (!createdBy) {
        setRequestError("Impossibile identificare l'associato.");
        return;
      }

      const result = await requestLessonMove(supabase, {
        lessonId: requestForm.lesson.id,
        startsAt,
        roomId: requestForm.roomId || null,
        scope,
        note: requestForm.note,
        createdBy,
      });
      if (!result.success) {
        setRequestError(
          result.errorMessage || "Impossibile inviare la richiesta.",
        );
        return;
      }
      setRequestForm(null);
      await reloadLessons();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Impossibile inviare la richiesta.",
      );
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {isStaff ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:contents">
            {unified && scopeOptions.length > 1 ? (
              <div
                className="inline-flex shrink-0 rounded-md bg-neutral-100 p-0.5"
                role="group"
                aria-label="Cosa mostrare"
              >
                {scopeOptions.includes("tutto") ? (
                  <ModePill
                    active={scope === "tutto"}
                    onClick={() => pushQuery({ ambito: "tutto" })}
                  >
                    Tutto
                  </ModePill>
                ) : null}
                {scopeOptions.includes("lezioni") ? (
                  <ModePill
                    active={scope === "lezioni"}
                    onClick={() => pushQuery({ ambito: "lezioni" })}
                  >
                    Lezioni
                  </ModePill>
                ) : null}
                {scopeOptions.includes("prenotazioni") ? (
                  <ModePill
                    active={scope === "prenotazioni"}
                    onClick={() => pushQuery({ ambito: "prenotazioni" })}
                  >
                    Prenotazioni
                  </ModePill>
                ) : null}
              </div>
            ) : null}

            {!bookingsOnly && !unified ? (
              <div
                className="inline-flex shrink-0 rounded-md bg-neutral-100 p-0.5"
                role="group"
                aria-label="Filtro calendario"
              >
                <ModePill
                  active={mode === "docente"}
                  onClick={() => pushQuery({ modo: "docente" })}
                >
                  Docente
                </ModePill>
                <ModePill
                  active={mode === "sala"}
                  onClick={() => pushQuery({ modo: "sala" })}
                >
                  Sala
                </ModePill>
              </div>
            ) : null}

            {unified ? (
              <>
                {(scope === "tutto" || scope === "lezioni") &&
                !lockTeacherId ? (
                  <select
                    aria-label="Docente"
                    value={teacherId}
                    onChange={(event) =>
                      pushQuery({ docente: event.target.value || null })
                    }
                    className="h-7 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:min-w-[9rem] sm:flex-none"
                  >
                    <option value="">Tutti i docenti</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                {scope === "tutto" ||
                scope === "prenotazioni" ||
                scope === "lezioni" ? (
                  <select
                    aria-label="Sala"
                    value={roomId}
                    onChange={(event) =>
                      pushQuery({ sala: event.target.value || null })
                    }
                    className="h-7 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:min-w-[9rem] sm:flex-none"
                  >
                    <option value="">Tutte le sale</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            ) : bookingsOnly || mode === "sala" ? (
              <select
                aria-label="Sala"
                value={roomId}
                onChange={(event) =>
                  pushQuery({ sala: event.target.value || null })
                }
                className="h-7 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:min-w-[10rem] sm:flex-none"
              >
                <option value="">Tutte le sale</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                aria-label="Docente"
                value={teacherId}
                onChange={(event) =>
                  pushQuery({ docente: event.target.value || null })
                }
                className="h-7 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:min-w-[10rem] sm:flex-none"
              >
                <option value="">Tutti i docenti</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <span className="mt-1 flex items-center gap-2.5 text-[10px] text-neutral-500 sm:mt-0 sm:gap-3 sm:text-[11px]">
            {scopeIncludesLessons ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-sm bg-amber-300" />
                Lezioni
              </span>
            ) : null}
            {scopeIncludesBookings ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-sm bg-emerald-400" />
                  Prenotazioni
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-sm bg-neutral-300" />
                  Esterno
                </span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <div
        aria-busy={lessonsBusy}
        className={
          lessonsBusy
            ? "opacity-70 transition-opacity"
            : "transition-opacity"
        }
      >
        <LessonsCalendar
          lessons={lessons}
          view={view}
          anchorDate={anchorDate}
          sundayVisible={settings.sundayVisible}
          gridOpenMinute={settings.gridOpenMinute}
          gridCloseMinute={settings.gridCloseMinute}
          slotGranularityMinutes={settings.slotGranularityMinutes}
          canDrag={scopeIncludesLessons && canDrag}
          canDragBookings={canManageBookingEvents}
          moveSingleScope={bookingsOnly || scope === "prenotazioni"}
          showTeacherName={isStaff}
          rooms={rooms}
          highlightDay={highlight}
          onMove={handleMove}
          onOpenLesson={handleOpenLesson}
          onSlotDoubleClick={
            canManageBookingEvents
              ? (date, startMinute) => openCreateBooking(date, startMinute)
              : undefined
          }
          onSlotRangeSelect={
            canManageBookingEvents
              ? (date, startMinute, durationMinutes) =>
                  openCreateBooking(date, startMinute, durationMinutes)
              : undefined
          }
          onSelectDay={(date) =>
            pushQuery({ view: "day", date, hl: date })
          }
          onViewChange={(next) => pushQuery({ view: next })}
          onAnchorDateChange={(date) => pushQuery({ date })}
        />
      </div>

      {attendanceLesson && memberId ? (
        <Dialog
          title="Registro"
          wide
          onClose={() => setAttendanceLesson(null)}
        >
          <p className="text-sm text-neutral-600">
            #{attendanceLesson.sequenceNumber}{" "}
            {attendanceLesson.courseName.trim() ||
              attendanceLesson.studentNames[0] ||
              "Lezione"}
          </p>
          {attendanceLesson.hasAttendance && !isStaff ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Presenze già segnate: puoi modificarle se il mese è aperto e
              sei nella finestra di 14 giorni. Per spostare la lezione serve
              prima lo sblocco in segreteria.
            </p>
          ) : null}
          <div className="mt-4">
            <LessonAttendancePanel
              lessonId={attendanceLesson.id}
              actorMemberId={memberId}
              isStaff={isStaff}
              onSaved={() => void reloadLessons()}
            />
          </div>
        </Dialog>
      ) : null}

      {bookingDialog && canManageBookingEvents ? (
        <BookingCalendarDialog
          mode={bookingDialog.mode}
          bookingId={
            bookingDialog.mode === "edit" ? bookingDialog.bookingId : undefined
          }
          draft={
            bookingDialog.mode === "create" ? bookingDialog.draft : undefined
          }
          external={
            bookingDialog.mode === "external"
              ? bookingDialog.external
              : undefined
          }
          rooms={bookingRooms}
          onClose={() => setBookingDialog(null)}
          onSaved={() => void reloadLessons()}
        />
      ) : null}

      {actionLesson ? (
        <Dialog
          title="Lezione"
          onClose={() => setActionLesson(null)}
        >
          <p className="text-sm text-neutral-600">
            #{actionLesson.sequenceNumber}{" "}
            {actionLesson.courseName.trim() ||
              actionLesson.studentNames[0] ||
              "Lezione"}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setActionLesson(null)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => beginRequest(actionLesson)}
              className="rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
            >
              Richiedi spostamento
            </button>
            <button
              type="button"
              onClick={() => openCourse(actionLesson)}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
            >
              Apri corso
            </button>
          </div>
        </Dialog>
      ) : null}

      {requestForm ? (
        <Dialog
          title="Richiedi spostamento"
          onClose={() => {
            if (!requestBusy) {
              setRequestForm(null);
              setRequestError(null);
            }
          }}
        >
          <p className="text-sm text-neutral-600">
            #{requestForm.lesson.sequenceNumber}{" "}
            {requestForm.lesson.courseName.trim() ||
              requestForm.lesson.studentNames[0] ||
              "Lezione"}
          </p>

          <label className="mt-4 block text-xs font-medium text-neutral-600">
            Data e ora
            <input
              type="datetime-local"
              value={requestForm.startsLocal}
              disabled={requestBusy}
              onChange={(event) =>
                setRequestForm((current) =>
                  current
                    ? { ...current, startsLocal: event.target.value }
                    : current,
                )
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </label>

          {requestForm.lesson.courseKind !== "online" && rooms.length > 0 ? (
            <label className="mt-3 block text-xs font-medium text-neutral-600">
              Sala
              <select
                value={requestForm.roomId}
                disabled={requestBusy}
                onChange={(event) =>
                  setRequestForm((current) =>
                    current
                      ? { ...current, roomId: event.target.value }
                      : current,
                  )
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

          <label className="mt-3 block text-xs font-medium text-neutral-600">
            Nota
            <textarea
              value={requestForm.note}
              disabled={requestBusy}
              rows={3}
              onChange={(event) =>
                setRequestForm((current) =>
                  current ? { ...current, note: event.target.value } : current,
                )
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </label>

          {requestError ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {requestError}
            </p>
          ) : null}

          {requestForm.lesson.courseStatus === "attivo" ? (
            <p className="mt-4 text-sm font-medium text-neutral-800">
              Sposto solo questa o tutte le successive?
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              disabled={requestBusy}
              onClick={() => {
                setRequestForm(null);
                setRequestError(null);
              }}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Annulla
            </button>
            {requestForm.lesson.courseStatus === "attivo" ? (
              <>
                <button
                  type="button"
                  disabled={requestBusy}
                  onClick={() => void submitRequest("this")}
                  className="rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-50"
                >
                  {requestBusy ? "Invio…" : "Solo questa"}
                </button>
                <button
                  type="button"
                  disabled={requestBusy}
                  onClick={() => void submitRequest("future")}
                  className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                >
                  {requestBusy ? "Invio…" : "Tutte le successive"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={requestBusy}
                onClick={() => void submitRequest("this")}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
              >
                {requestBusy ? "Invio…" : "Invia richiesta"}
              </button>
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function ModePill({
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
          ? "touch-manipulation rounded px-2.5 py-0.5 text-xs font-medium text-white bg-[var(--brand)]"
          : "touch-manipulation rounded px-2.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-white"
      }
    >
      {children}
    </button>
  );
}

function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-dialog-title"
        className={`w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            id="calendar-dialog-title"
            className="text-lg font-semibold text-[var(--brand)]"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Chiudi
          </button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
