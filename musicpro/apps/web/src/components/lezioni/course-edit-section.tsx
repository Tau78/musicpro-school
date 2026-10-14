"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyCourseScheduleResync,
  formatEuro,
  patchCourse,
  previewCourseScheduleResync,
  type ApplyCourseScheduleRow,
  type CourseDetail,
  type CourseDurationMinutes,
  type CourseKind,
  type CourseSchedulePreview,
  type IsoWeekday,
  type PatchCourseInput,
  minutesToTimeLabel,
} from "@musicpro/database";

import {
  courseKindLabel,
  courseSlotLabel,
  WEEKDAY_LABELS,
} from "@/components/lezioni/course-labels";
import { CourseScheduleResyncPanel } from "@/components/lezioni/course-schedule-resync-panel";
import { createClient } from "@/lib/supabase/client";

const DURATIONS: CourseDurationMinutes[] = [30, 45, 60, 90];

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

function buildStartMinutes(open: number, close: number, step: number): number[] {
  const minutes: number[] = [];
  const safeStep = step > 0 ? step : 15;
  for (let m = open; m < close; m += safeStep) {
    minutes.push(m);
  }
  return minutes;
}

function durationLabel(minutes: number): string {
  return minutes === 30 ? "30 min (½ ora)" : `${minutes} min`;
}

export function CourseEditSection({
  course,
  mode,
  actorMemberId,
  isStaff,
  canReschedule,
  subjects = [],
  rooms,
  packPrices = [],
  sundayVisible,
  gridOpenMinute,
  gridCloseMinute,
  slotGranularityMinutes,
  showPrice,
}: {
  course: CourseDetail;
  mode: "staff" | "teacher";
  actorMemberId: string;
  isStaff: boolean;
  canReschedule: boolean;
  subjects?: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  packPrices?: {
    courseKind: CourseKind;
    durationMinutes: number;
    amountEur: number | null;
  }[];
  sundayVisible: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  slotGranularityMinutes: number;
  showPrice: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [subjectId, setSubjectId] = useState(course.subjectId);
  const [roomId, setRoomId] = useState(course.roomId ?? "");
  const [durationMinutes, setDurationMinutes] = useState<CourseDurationMinutes>(
    course.durationMinutes as CourseDurationMinutes,
  );
  const [weeklyDow, setWeeklyDow] = useState<IsoWeekday>(course.weeklyDow);
  const [weeklyStartMinute, setWeeklyStartMinute] = useState(
    course.weeklyStartMinute,
  );
  const [startsOn, setStartsOn] = useState(course.startsOn);
  const [priceEur, setPriceEur] = useState(String(course.priceEur));
  const [maxStudents, setMaxStudents] = useState(String(course.maxStudents));
  const [schedulePreview, setSchedulePreview] =
    useState<CourseSchedulePreview | null>(null);
  const [schedulePatch, setSchedulePatch] = useState<PatchCourseInput | null>(
    null,
  );
  const scheduleStepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!schedulePreview) return;
    scheduleStepRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [schedulePreview]);

  const weekdayOptions = useMemo(() => {
    const entries = Object.entries(WEEKDAY_LABELS) as [string, string][];
    return entries.filter(([dow]) => sundayVisible || dow !== "7");
  }, [sundayVisible]);

  const startMinutes = useMemo(
    () => buildStartMinutes(gridOpenMinute, gridCloseMinute, slotGranularityMinutes),
    [gridCloseMinute, gridOpenMinute, slotGranularityMinutes],
  );

  const titularLabel = course.titular
    ? `${course.titular.lastName} ${course.titular.firstName}`.trim()
    : "—";
  const roomLabel =
    course.courseKind === "online"
      ? "Online"
      : course.roomId
        ? (rooms.find((r) => r.id === course.roomId)?.name ?? "—")
        : "—";

  function buildPatchInput(): PatchCourseInput {
    const parsedPrice = Number.parseFloat(priceEur.replace(",", "."));
    return mode === "staff"
      ? {
          subjectId,
          roomId: course.courseKind === "online" ? null : roomId || null,
          durationMinutes,
          weeklyDow,
          weeklyStartMinute,
          startsOn,
          priceEur: parsedPrice,
          maxStudents:
            course.courseKind === "gruppo"
              ? Number.parseInt(maxStudents, 10)
              : undefined,
        }
      : {
          roomId: course.courseKind === "online" ? null : roomId || null,
          durationMinutes,
          weeklyDow,
          weeklyStartMinute,
        };
  }

  function scheduleChanged(input: PatchCourseInput): boolean {
    return (
      input.durationMinutes !== course.durationMinutes ||
      input.weeklyDow !== course.weeklyDow ||
      input.weeklyStartMinute !== course.weeklyStartMinute ||
      (input.roomId !== undefined && input.roomId !== course.roomId) ||
      (input.startsOn !== undefined && input.startsOn !== course.startsOn)
    );
  }

  function metaChanged(input: PatchCourseInput): boolean {
    if (mode !== "staff") return false;
    return (
      (input.subjectId !== undefined && input.subjectId !== course.subjectId) ||
      (input.priceEur !== undefined && input.priceEur !== course.priceEur) ||
      (input.maxStudents !== undefined &&
        input.maxStudents !== course.maxStudents)
    );
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const input = buildPatchInput();
    const actor = { memberId: actorMemberId, isStaff, canReschedule };
    const needsSchedule =
      scheduleChanged(input) &&
      !course.isTrial &&
      (course.status === "attivo" ||
        course.status === "in_pausa" ||
        course.status === "in_attesa");

    if (!scheduleChanged(input) && !metaChanged(input)) {
      setBusy(false);
      setEditing(false);
      return;
    }

    if (needsSchedule) {
      // Svuota lo step precedente così un secondo Salva non riusa le righe vecchie.
      setSchedulePreview(null);
      setSchedulePatch(null);
      const preview = await previewCourseScheduleResync(
        supabase,
        course.id,
        input,
        actor,
      );
      setBusy(false);
      if (!preview.success) {
        setError(preview.errorMessage ?? "Impossibile calcolare la programmazione.");
        return;
      }
      setSchedulePatch(input);
      setSchedulePreview(preview.preview);
      return;
    }

    const result = await patchCourse(supabase, course.id, input, actor);
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare.");
      return;
    }
    if (result.warnings?.length) {
      setNotice(result.warnings.join(" "));
    }
    setEditing(false);
    router.refresh();
  }

  async function handleConfirmSchedule(rows: ApplyCourseScheduleRow[]) {
    if (!schedulePatch) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await applyCourseScheduleResync(
      supabase,
      course.id,
      schedulePatch,
      rows,
      { memberId: actorMemberId, isStaff, canReschedule },
    );
    setBusy(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare la programmazione.");
      return;
    }
    if (result.warnings?.length) {
      setNotice(result.warnings.join(" "));
    }
    setSchedulePreview(null);
    setSchedulePatch(null);
    setEditing(false);
    router.refresh();
  }

  function handleCancel() {
    setSubjectId(course.subjectId);
    setRoomId(course.roomId ?? "");
    setDurationMinutes(course.durationMinutes as CourseDurationMinutes);
    setWeeklyDow(course.weeklyDow);
    setWeeklyStartMinute(course.weeklyStartMinute);
    setStartsOn(course.startsOn);
    setPriceEur(String(course.priceEur));
    setMaxStudents(String(course.maxStudents));
    setError(null);
    setNotice(null);
    setSchedulePreview(null);
    setSchedulePatch(null);
    setEditing(false);
  }

  return (
    <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          Dettaglio
        </h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-[var(--brand)] px-2.5 py-1 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
          >
            Modifica
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      ) : null}

      {!editing ? (
        <dl className="grid grid-cols-2 gap-3">
          <Row label="Materia" value={course.subjectName ?? "—"} />
          <Row label="Tipo" value={courseKindLabel(course.courseKind)} />
          <Row label="Titolare" value={titularLabel} />
          <Row label="Sala" value={roomLabel} />
          <Row label="Slot" value={courseSlotLabel(course)} />
          <Row label="Inizio" value={course.startsOn} />
          {course.courseKind === "gruppo" ? (
            <Row label="Capienza" value={String(course.maxStudents)} />
          ) : null}
          {showPrice ? (
            <Row label="Prezzo" value={formatEuro(course.priceEur)} />
          ) : null}
          {course.closedOn ? (
            <Row label="Chiuso il" value={course.closedOn} />
          ) : null}
        </dl>
      ) : schedulePreview && schedulePatch ? (
        <div ref={scheduleStepRef} className="space-y-2">
          <p className="rounded-lg border border-[var(--brand)]/20 bg-[var(--brand)]/5 px-3 py-2 text-sm text-[var(--brand)]">
            Step 2 di 2 — conferma la nuova programmazione, poi salva.
          </p>
          <CourseScheduleResyncPanel
            preview={schedulePreview}
            busy={busy}
            onCancel={() => {
              setSchedulePreview(null);
              setSchedulePatch(null);
            }}
            onConfirm={(rows) => void handleConfirmSchedule(rows)}
          />
        </div>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Se cambi giorno, ora, sala, durata o data inizio, dopo Salva compare
            lo step «Nuova programmazione» per confermare le lezioni.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {mode === "staff" ? (
              <label className="min-w-0 text-sm">
                <span className="mb-0.5 block text-xs text-neutral-500">Materia</span>
                <select
                  required
                  value={subjectId}
                  disabled={busy}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className={inputClass}
                >
                  {subjects.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Row label="Materia" value={course.subjectName ?? "—"} />
            )}
            <Row label="Tipo" value={courseKindLabel(course.courseKind)} />
            <Row label="Titolare" value={titularLabel} />
            {course.courseKind !== "online" ? (
              <label className="min-w-0 text-sm">
                <span className="mb-0.5 block text-xs text-neutral-500">Sala</span>
                <select
                  required
                  value={roomId}
                  disabled={busy}
                  onChange={(e) => setRoomId(e.target.value)}
                  className={inputClass}
                >
                  {rooms.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Row label="Sala" value="Online" />
            )}
            <label className="min-w-0 text-sm">
              <span className="mb-0.5 block text-xs text-neutral-500">Giorno</span>
              <select
                required
                value={weeklyDow}
                disabled={busy}
                onChange={(e) =>
                  setWeeklyDow(Number(e.target.value) as IsoWeekday)
                }
                className={inputClass}
              >
                {weekdayOptions.map(([dow, label]) => (
                  <option key={dow} value={dow}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm">
              <span className="mb-0.5 block text-xs text-neutral-500">Ora</span>
              <select
                required
                value={weeklyStartMinute}
                disabled={busy}
                onChange={(e) =>
                  setWeeklyStartMinute(Number.parseInt(e.target.value, 10))
                }
                className={inputClass}
              >
                {startMinutes.map((m) => (
                  <option key={m} value={m}>
                    {minutesToTimeLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm">
              <span className="mb-0.5 block text-xs text-neutral-500">Durata</span>
              <select
                required
                value={durationMinutes}
                disabled={busy}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10) as CourseDurationMinutes;
                  setDurationMinutes(next);
                  if (mode === "staff") {
                    const pack = packPrices.find(
                      (p) =>
                        p.courseKind === course.courseKind &&
                        p.durationMinutes === next,
                    );
                    if (pack?.amountEur != null) {
                      setPriceEur(String(pack.amountEur));
                    }
                  }
                }}
                className={inputClass}
              >
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {durationLabel(minutes)}
                  </option>
                ))}
              </select>
            </label>
            {mode === "staff" ? (
              <label className="min-w-0 text-sm">
                <span className="mb-0.5 block text-xs text-neutral-500">Inizio</span>
                <input
                  required
                  type="date"
                  value={startsOn}
                  disabled={busy}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className={inputClass}
                />
              </label>
            ) : (
              <Row label="Inizio" value={course.startsOn} />
            )}
            {mode === "staff" && course.courseKind === "gruppo" ? (
              <label className="min-w-0 text-sm">
                <span className="mb-0.5 block text-xs text-neutral-500">Capienza</span>
                <input
                  required
                  type="number"
                  min={1}
                  value={maxStudents}
                  disabled={busy}
                  onChange={(e) => setMaxStudents(e.target.value)}
                  className={inputClass}
                />
              </label>
            ) : null}
            {mode === "staff" && showPrice ? (
              <label className="min-w-0 text-sm">
                <span className="mb-0.5 block text-xs text-neutral-500">
                  Prezzo pack (€)
                </span>
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  value={priceEur}
                  disabled={busy}
                  onChange={(e) => setPriceEur(e.target.value)}
                  className={inputClass}
                />
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {busy ? "Salvataggio…" : "Salva"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleCancel}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="truncate text-sm font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
