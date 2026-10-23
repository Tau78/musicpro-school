"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelTeacherAbsence,
  getTeacherProfile,
  listRoomsForLessons,
  listTeacherAbsenceLessons,
  moveTeacherAbsence,
  previewTeacherAbsenceMove,
  todayInRome,
  type Room,
  type TeacherAbsenceLesson,
  type TeacherAbsencePreview,
  type TeacherAbsenceTarget,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export type TeacherAbsenceDialogProps = {
  open: boolean;
  onClose: () => void;
  actorMemberId: string;
  isStaff: boolean;
  teacherId?: string;
  teachers?: { id: string; label: string }[];
};

type AbsenceMode = "cancel" | "bulk" | "individual";

type LessonTargetFields = {
  date: string;
  time: string;
  roomId: string;
};

const inputClass =
  "w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

const outlineBtnClass =
  "rounded-lg border border-[var(--brand)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-neutral-50 disabled:opacity-50";

const brandBtnClass =
  "rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50";

const modeBtnClass = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-xs font-medium ${
    active
      ? "bg-[var(--brand)] text-white"
      : "border border-neutral-300 bg-white text-neutral-700"
  }`;

export function TeacherAbsenceDialog({
  open,
  onClose,
  actorMemberId,
  isStaff,
  teacherId,
  teachers,
}: TeacherAbsenceDialogProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayInRome();

  const showTeacherSelect = isStaff && (teachers?.length ?? 0) > 0;
  const initialTitular =
    teacherId ??
    (isStaff ? (teachers?.[0]?.id ?? actorMemberId) : actorMemberId);

  const [selectedTeacherId, setSelectedTeacherId] = useState(initialTitular);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [lessons, setLessons] = useState<TeacherAbsenceLesson[]>([]);
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState<AbsenceMode>("cancel");
  const [canReschedule, setCanReschedule] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkRoomId, setBulkRoomId] = useState("");
  const [perLesson, setPerLesson] = useState<Record<string, LessonTargetFields>>(
    {},
  );
  const [preview, setPreview] = useState<TeacherAbsencePreview | null>(null);
  const [notifySegreteria, setNotifySegreteria] = useState(false);
  const [notifyFamily, setNotifyFamily] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const titularMemberId = isStaff
    ? selectedTeacherId || teacherId || actorMemberId
    : actorMemberId;

  const eligibleLessons = useMemo(
    () => lessons.filter((lesson) => !lesson.hasAttendance),
    [lessons],
  );

  const allowMoveModes = isStaff || canReschedule;

  const resetDialog = useCallback(() => {
    setFromDate(today);
    setToDate(today);
    setLessons([]);
    setSearched(false);
    setMode("cancel");
    setBulkDate("");
    setBulkRoomId("");
    setPerLesson({});
    setPreview(null);
    setNotifySegreteria(false);
    setNotifyFamily(false);
    setError(null);
    setSuccess(null);
    setSelectedTeacherId(initialTitular);
  }, [today, initialTitular]);

  useEffect(() => {
    if (!open) return;
    resetDialog();
  }, [open, resetDialog]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listRoomsForLessons(supabase).then((list) => {
      if (!cancelled) setRooms(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  useEffect(() => {
    if (!open || isStaff) {
      setCanReschedule(true);
      return;
    }
    let cancelled = false;
    void getTeacherProfile(supabase, actorMemberId)
      .then((profile) => {
        if (!cancelled) setCanReschedule(profile?.canReschedule ?? false);
      })
      .catch(() => {
        if (!cancelled) setCanReschedule(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isStaff, actorMemberId, supabase]);

  useEffect(() => {
    if (!allowMoveModes && mode !== "cancel") {
      setMode("cancel");
      setPreview(null);
    }
  }, [allowMoveModes, mode]);

  function initPerLessonTargets(list: TeacherAbsenceLesson[]) {
    const next: Record<string, LessonTargetFields> = {};
    for (const lesson of list.filter((l) => !l.hasAttendance)) {
      next[lesson.id] = {
        date: lesson.dateLabel,
        time: lesson.timeLabel,
        roomId:
          lesson.courseKind === "online"
            ? ""
            : (lesson.roomId ?? rooms[0]?.id ?? ""),
      };
    }
    setPerLesson(next);
  }

  async function handleSearch() {
    setError(null);
    setSuccess(null);
    setPreview(null);
    if (!titularMemberId) {
      setError("Seleziona un docente.");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Dal e al sono obbligatori.");
      return;
    }
    if (toDate < fromDate) {
      setError("La data di fine deve essere successiva o uguale all'inizio.");
      return;
    }

    setBusy(true);
    const result = await listTeacherAbsenceLessons(supabase, {
      titularMemberId,
      fromDate,
      toDate,
      actorMemberId,
      isStaff,
    });
    setBusy(false);

    if ("errorMessage" in result) {
      setError(result.errorMessage);
      setLessons([]);
      setSearched(true);
      return;
    }

    setLessons(result.lessons);
    setSearched(true);
    initPerLessonTargets(result.lessons);
  }

  function roomIdForLesson(
    lesson: TeacherAbsenceLesson,
    chosenRoomId: string,
  ): string | null {
    if (lesson.courseKind === "online") return null;
    return chosenRoomId || null;
  }

  function clock(value: string): string {
    const match = value.trim().match(/^(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value.trim();
  }

  function buildBulkTargets(): TeacherAbsenceTarget[] | string {
    if (!bulkDate) return "Scegli la nuova data.";
    const needsRoom = eligibleLessons.some(
      (lesson) => lesson.courseKind !== "online",
    );
    if (needsRoom && !bulkRoomId) return "Scegli la sala.";
    return eligibleLessons.map((lesson) => ({
      lessonId: lesson.id,
      date: bulkDate,
      time: clock(lesson.timeLabel),
      roomId: roomIdForLesson(lesson, bulkRoomId),
    }));
  }

  function buildIndividualTargets(
    onlyLessonIds?: Set<string>,
  ): TeacherAbsenceTarget[] | string {
    const targets: TeacherAbsenceTarget[] = [];
    for (const lesson of eligibleLessons) {
      if (onlyLessonIds && !onlyLessonIds.has(lesson.id)) continue;
      const fields = perLesson[lesson.id];
      if (!fields?.date || !fields.time) {
        return "Compila data e ora per ogni lezione.";
      }
      if (lesson.courseKind !== "online" && !fields.roomId) {
        return "Scegli la sala per ogni lezione in presenza.";
      }
      targets.push({
        lessonId: lesson.id,
        date: fields.date,
        time: clock(fields.time),
        roomId: roomIdForLesson(lesson, fields.roomId),
      });
    }
    if (targets.length === 0) return "Nessuna lezione da spostare.";
    return targets;
  }

  function currentMoveTargets(
    onlyFree?: boolean,
  ): TeacherAbsenceTarget[] | string {
    if (mode === "bulk") {
      const all = buildBulkTargets();
      if (typeof all === "string") return all;
      if (!onlyFree || !preview) return all;
      const free = new Set(preview.freeLessonIds);
      return all.filter((t) => free.has(t.lessonId));
    }
    if (mode === "individual") {
      if (onlyFree && preview) {
        const free = new Set(preview.freeLessonIds);
        return buildIndividualTargets(free);
      }
      return buildIndividualTargets();
    }
    return [];
  }

  async function handlePreview() {
    setError(null);
    setSuccess(null);
    const targets = currentMoveTargets();
    if (typeof targets === "string") {
      setError(targets);
      return;
    }
    if (targets.length === 0) {
      setError("Compila data e sala per lo spostamento.");
      return;
    }

    setBusy(true);
    const result = await previewTeacherAbsenceMove(supabase, {
      titularMemberId,
      actorMemberId,
      isStaff,
      targets,
    });
    setBusy(false);

    if ("errorMessage" in result) {
      setError(result.errorMessage);
      setPreview(null);
      return;
    }
    setPreview(result);
  }

  async function handleCancelLessons() {
    setError(null);
    setSuccess(null);
    const ids = eligibleLessons.map((l) => l.id);
    if (ids.length === 0) {
      setError("Nessuna lezione da annullare.");
      return;
    }
    if (
      !window.confirm(
        "Le lezioni spariscono dai calendari e non generano compenso: non restano da recuperare. Confermi?",
      )
    ) {
      return;
    }

    setBusy(true);
    const result = await cancelTeacherAbsence(supabase, {
      titularMemberId,
      actorMemberId,
      isStaff,
      fromDate,
      toDate,
      lessonIds: ids,
      notifySegreteria,
      notifyFamily,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile annullare le lezioni.");
      return;
    }
    const note =
      result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
    const conflictNote =
      result.conflicts.length > 0
        ? ` ${result.conflicts.map((row) => `${row.courseName}: ${row.message}`).join(" ")}`
        : "";
    router.refresh();
    if (result.leftIds.length > 0) {
      const left = new Set(result.leftIds);
      const remaining = lessons.filter((lesson) => left.has(lesson.id));
      setLessons(remaining);
      initPerLessonTargets(remaining);
      setSuccess(
        `Annullate ${result.cancelledIds.length} lezioni. Le altre restano in elenco.${conflictNote}${note}`,
      );
      return;
    }
    setLessons([]);
    setPreview(null);
    setSuccess(`Lezioni annullate.${note}`);
  }

  async function handleMove(conflictPolicy: "all" | "partial") {
    setError(null);
    setSuccess(null);
    const targets = currentMoveTargets(conflictPolicy === "partial");
    if (typeof targets === "string") {
      setError(targets);
      return;
    }
    if (targets.length === 0) {
      setError("Nessuna lezione da spostare.");
      return;
    }
    if (conflictPolicy === "all" && preview && !preview.ok) {
      setError("Risolvi i conflitti o usa «Sposta solo le libere».");
      return;
    }

    setBusy(true);
    const result = await moveTeacherAbsence(supabase, {
      titularMemberId,
      actorMemberId,
      isStaff,
      fromDate,
      toDate,
      targets,
      conflictPolicy,
      notifySegreteria,
      notifyFamily,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile spostare le lezioni.");
      return;
    }

    const warn =
      result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";

    router.refresh();
    if (result.leftIds.length > 0) {
      const leftSet = new Set(result.leftIds);
      const remaining = lessons.filter((l) => leftSet.has(l.id));
      setLessons(remaining);
      setMode("individual");
      setPreview(null);
      initPerLessonTargets(remaining);
      setSuccess(
        `Spostate ${result.movedIds.length} lezioni. Le altre restano in elenco: spostale una per una o annullale.${warn}`,
      );
      return;
    }

    setLessons([]);
    setPreview(null);
    setSuccess(`Spostamento completato.${warn}`);
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  if (!open) return null;

  const showMoveForm = mode === "bulk" || mode === "individual";
  const canConfirmMoveAll = preview?.ok === true && showMoveForm;
  const canConfirmPartial =
    showMoveForm &&
    preview != null &&
    !preview.ok &&
    preview.freeLessonIds.length > 0;

  let confirmLabel: string | null = null;
  let confirmAction: (() => void) | null = null;
  let confirmDisabled = busy;

  if (mode === "cancel" && searched && eligibleLessons.length > 0) {
    confirmLabel = "Annulla lezioni";
    confirmAction = () => void handleCancelLessons();
  } else if (canConfirmMoveAll) {
    confirmLabel = "Sposta";
    confirmAction = () => void handleMove("all");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-absence-title"
        className="flex max-h-full min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
          <h2
            id="teacher-absence-title"
            className="text-base font-semibold text-[var(--brand)]"
          >
            Sarò assente
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
            {showTeacherSelect ? (
              <label className="flex min-w-0 max-w-full flex-[1_1_100%] flex-col gap-1 text-xs text-neutral-600 sm:flex-[1_1_10rem]">
                Docente
                <select
                  value={titularMemberId}
                  disabled={busy}
                  onChange={(event) => {
                    setSelectedTeacherId(event.target.value);
                    setPreview(null);
                  }}
                  className={inputClass}
                >
                  {teachers!.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="flex min-w-0 max-w-full flex-[1_1_8rem] flex-col gap-1 text-xs text-neutral-600">
              Dal
              <input
                type="date"
                value={fromDate}
                disabled={busy}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPreview(null);
                }}
                className={inputClass}
              />
            </label>
            <label className="flex min-w-0 max-w-full flex-[1_1_8rem] flex-col gap-1 text-xs text-neutral-600">
              Al
              <input
                type="date"
                value={toDate}
                disabled={busy}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPreview(null);
                }}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              disabled={busy || !titularMemberId}
              onClick={() => void handleSearch()}
              className={outlineBtnClass}
            >
              {busy && !searched ? "Cerco…" : "Cerca"}
            </button>
          </div>

          {error ? (
            <p className="mt-2 text-sm text-red-700">{error}</p>
          ) : null}
          {success ? (
            <p className="mt-2 text-sm text-green-700">{success}</p>
          ) : null}

          {searched ? (
            <div className="mt-3 space-y-3">
              {lessons.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  Nessuna lezione nel periodo.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                  {lessons.map((lesson) => {
                    const disabled = lesson.hasAttendance;
                    return (
                      <li
                        key={lesson.id}
                        className={`px-3 py-2 text-sm ${disabled ? "bg-neutral-50 text-neutral-500" : ""}`}
                      >
                        <p className="font-medium text-neutral-900">
                          {lesson.courseName}
                        </p>
                        <p className="text-xs text-neutral-600">
                          {lesson.dateLabel} {lesson.timeLabel}
                          {lesson.roomName ? ` · ${lesson.roomName}` : ""}
                          {lesson.studentNames.length > 0
                            ? ` · ${lesson.studentNames.join(", ")}`
                            : ""}
                        </p>
                        {disabled ? (
                          <p className="text-xs text-neutral-500">
                            Già presenziata
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {eligibleLessons.length > 0 ? (
                <>
                  <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      className={modeBtnClass(mode === "cancel")}
                      onClick={() => {
                        setMode("cancel");
                        setPreview(null);
                      }}
                    >
                      Annulla
                    </button>
                    {allowMoveModes ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className={modeBtnClass(mode === "bulk")}
                          onClick={() => {
                            setMode("bulk");
                            setPreview(null);
                          }}
                        >
                          Sposta in blocco
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={modeBtnClass(mode === "individual")}
                          onClick={() => {
                            setMode("individual");
                            setPreview(null);
                          }}
                        >
                          Una per una
                        </button>
                      </>
                    ) : null}
                  </div>

                  {!allowMoveModes ? (
                    <p className="text-xs text-neutral-600">
                      Lo spostamento è disattivato sul tuo profilo.
                    </p>
                  ) : null}

                  {mode === "cancel" ? (
                    <p className="text-sm text-neutral-600">
                      Le lezioni spariscono dai calendari e non generano
                      compenso.
                    </p>
                  ) : null}

                  {mode === "bulk" ? (
                    <div className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
                      <label className="flex min-w-0 max-w-full flex-[1_1_8rem] flex-col gap-1 text-xs text-neutral-600">
                        Nuova data
                        <input
                          type="date"
                          value={bulkDate}
                          disabled={busy}
                          onChange={(event) => {
                            setBulkDate(event.target.value);
                            setPreview(null);
                          }}
                          className={inputClass}
                        />
                      </label>
                      <label className="flex min-w-0 max-w-full flex-[1_1_10rem] flex-col gap-1 text-xs text-neutral-600">
                        Sala
                        <select
                          value={bulkRoomId}
                          disabled={busy}
                          onChange={(event) => {
                            setBulkRoomId(event.target.value);
                            setPreview(null);
                          }}
                          className={inputClass}
                        >
                          <option value="">— Sala —</option>
                          {rooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy || !bulkDate}
                        onClick={() => void handlePreview()}
                        className={outlineBtnClass}
                      >
                        Controlla orari
                      </button>
                    </div>
                  ) : null}

                  {mode === "individual" ? (
                    <div className="space-y-2">
                      {eligibleLessons.map((lesson) => {
                        const fields = perLesson[lesson.id] ?? {
                          date: lesson.dateLabel,
                          time: lesson.timeLabel,
                          roomId: "",
                        };
                        const isOnline = lesson.courseKind === "online";
                        return (
                          <div
                            key={lesson.id}
                            className="rounded-lg border border-neutral-200 p-2"
                          >
                            <p className="truncate text-xs font-medium text-neutral-800">
                              {lesson.courseName}
                            </p>
                            <div className="mt-1 flex min-w-0 max-w-full flex-wrap items-end gap-2">
                              <label className="flex min-w-0 max-w-full flex-[1_1_7rem] flex-col gap-0.5 text-[10px] text-neutral-600">
                                Data
                                <input
                                  type="date"
                                  value={fields.date}
                                  disabled={busy}
                                  onChange={(event) => {
                                    setPerLesson((prev) => ({
                                      ...prev,
                                      [lesson.id]: {
                                        ...fields,
                                        date: event.target.value,
                                      },
                                    }));
                                    setPreview(null);
                                  }}
                                  className={inputClass}
                                />
                              </label>
                              <label className="flex min-w-0 max-w-full flex-[1_1_6rem] flex-col gap-0.5 text-[10px] text-neutral-600">
                                Ora
                                <input
                                  type="time"
                                  value={fields.time}
                                  disabled={busy}
                                  onChange={(event) => {
                                    setPerLesson((prev) => ({
                                      ...prev,
                                      [lesson.id]: {
                                        ...fields,
                                        time: event.target.value,
                                      },
                                    }));
                                    setPreview(null);
                                  }}
                                  className={inputClass}
                                />
                              </label>
                              {!isOnline ? (
                                <label className="flex min-w-0 max-w-full flex-[1_1_8rem] flex-col gap-0.5 text-[10px] text-neutral-600">
                                  Sala
                                  <select
                                    value={fields.roomId}
                                    disabled={busy}
                                    onChange={(event) => {
                                      setPerLesson((prev) => ({
                                        ...prev,
                                        [lesson.id]: {
                                          ...fields,
                                          roomId: event.target.value,
                                        },
                                      }));
                                      setPreview(null);
                                    }}
                                    className={inputClass}
                                  >
                                    <option value="">— Sala —</option>
                                    {rooms.map((room) => (
                                      <option key={room.id} value={room.id}>
                                        {room.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handlePreview()}
                        className={outlineBtnClass}
                      >
                        Controlla orari
                      </button>
                    </div>
                  ) : null}

                  {preview ? (
                    <div className="space-y-1 text-sm">
                      {preview.ok ? (
                        <p className="text-green-700">
                          Gli orari scelti sono liberi.
                        </p>
                      ) : (
                        <>
                          <ul className="space-y-1 text-red-700">
                            {preview.conflicts.map((c) => (
                              <li key={c.lessonId}>
                                <span className="font-medium">
                                  {c.courseName}
                                </span>
                                : {c.message}
                              </li>
                            ))}
                          </ul>
                          <p className="text-xs text-neutral-600">
                            Le altre restano dov&apos;erano: puoi annullarle o
                            spostarle una per una.
                          </p>
                        </>
                      )}
                    </div>
                  ) : null}

                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 text-sm">
                    <label
                      className="inline-flex items-center gap-1.5 text-neutral-700"
                      title="Se nessuno è attivo non parte nessuna email"
                    >
                      <input
                        type="checkbox"
                        checked={notifySegreteria}
                        disabled={busy}
                        onChange={(event) =>
                          setNotifySegreteria(event.target.checked)
                        }
                      />
                      Segreteria
                    </label>
                    <label
                      className="inline-flex items-center gap-1.5 text-neutral-700"
                      title="Se nessuno è attivo non parte nessuna email"
                    >
                      <input
                        type="checkbox"
                        checked={notifyFamily}
                        disabled={busy}
                        onChange={(event) =>
                          setNotifyFamily(event.target.checked)
                        }
                      />
                      Allievi e tutori
                    </label>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex min-w-0 max-w-full flex-wrap justify-end gap-2 border-t border-neutral-200 bg-white px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleClose}
            className={outlineBtnClass}
          >
            Chiudi
          </button>
          {canConfirmPartial ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleMove("partial")}
              className={outlineBtnClass}
            >
              Sposta solo le libere
            </button>
          ) : null}
          {confirmLabel && confirmAction ? (
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={confirmAction}
              className={brandBtnClass}
            >
              {busy ? "Attendi…" : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const teacherAbsenceButtonClass =
  "rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50";
