"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  createCourse,
  minutesToTimeLabel,
  type CourseDurationMinutes,
  type CourseKind,
  type IsoWeekday,
  type MemberSummary,
} from "@musicpro/database";

import { WEEKDAY_LABELS } from "@/components/lezioni/course-labels";
import { createClient } from "@/lib/supabase/client";

export type CourseCreateFormTerm = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
};

export type CourseCreateFormTeacher = {
  id: string;
  label: string;
};

export interface CourseCreateFormProps {
  actorMemberId: string;
  isStaff: boolean;
  canCreateCourses: boolean;
  subjects: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  members: MemberSummary[];
  sundayVisible: boolean;
  gridOpenMinute: number;
  gridCloseMinute: number;
  defaultGroupCapacity: number;
  currentTerm: CourseCreateFormTerm | null;
  teachers?: CourseCreateFormTeacher[];
}

const DURATIONS: CourseDurationMinutes[] = [30, 45, 60, 90];
const KINDS: { value: CourseKind; label: string }[] = [
  { value: "individuale", label: "Individuale" },
  { value: "gruppo", label: "Gruppo" },
  { value: "online", label: "Online" },
];

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

function todayInRome(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaultStartsOn(term: CourseCreateFormTerm): string {
  const today = todayInRome();
  if (today < term.startsOn) return term.startsOn;
  if (today > term.endsOn) return term.endsOn;
  return today;
}

function memberLabel(member: MemberSummary): string {
  const name = `${member.lastName} ${member.firstName}`.trim();
  return member.memberNumber != null ? `${name} (#${member.memberNumber})` : name;
}

function buildStartMinutes(open: number, close: number): number[] {
  const minutes: number[] = [];
  for (let m = open; m < close; m += 15) {
    minutes.push(m);
  }
  return minutes;
}

export function CourseCreateForm({
  actorMemberId,
  isStaff,
  canCreateCourses,
  subjects,
  rooms,
  members,
  sundayVisible,
  gridOpenMinute,
  gridCloseMinute,
  defaultGroupCapacity,
  currentTerm,
  teachers,
}: CourseCreateFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const listHref = isStaff ? "/admin/lezioni/corsi" : "/lezioni/corsi";
  const detailHref = (id: string) =>
    isStaff ? `/admin/lezioni/corsi/${id}` : `/lezioni/corsi/${id}`;

  const weekdays = (sundayVisible ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]) as IsoWeekday[];
  const startMinutes = useMemo(
    () => buildStartMinutes(gridOpenMinute, gridCloseMinute),
    [gridOpenMinute, gridCloseMinute],
  );

  const [kind, setKind] = useState<CourseKind>("individuale");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [durationMinutes, setDurationMinutes] =
    useState<CourseDurationMinutes>(60);
  const [weeklyDow, setWeeklyDow] = useState<IsoWeekday>(1);
  const [weeklyStartMinute, setWeeklyStartMinute] = useState(
    startMinutes[0] ?? gridOpenMinute,
  );
  const [startsOn, setStartsOn] = useState(
    currentTerm ? defaultStartsOn(currentTerm) : "",
  );
  const [maxStudents, setMaxStudents] = useState(defaultGroupCapacity);
  const [priceEur, setPriceEur] = useState("");
  const [titularMemberId, setTitularMemberId] = useState(
    teachers && teachers.length > 0 ? teachers[0].id : actorMemberId,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const maxSelectable = kind === "gruppo" ? maxStudents : 1;
  const membersById = useMemo(
    () => new Map(members.map((row) => [row.id, row])),
    [members],
  );
  const selectedStudents = studentIds
    .map((id) => membersById.get(id))
    .filter((row): row is MemberSummary => Boolean(row));

  const studentMatches = useMemo(() => {
    const term = studentQuery.trim().toLowerCase();
    const selected = new Set(studentIds);
    return members
      .filter((row) => row.isActive && !selected.has(row.id))
      .filter((row) => {
        if (!term) return true;
        const hay = `${row.lastName} ${row.firstName} ${row.email ?? ""} ${row.memberNumber ?? ""}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [members, studentIds, studentQuery]);

  function addStudent(id: string) {
    setStudentIds((prev) => {
      if (kind === "gruppo") {
        if (prev.includes(id) || prev.length >= maxStudents) return prev;
        return [...prev, id];
      }
      return [id];
    });
    setStudentQuery("");
  }

  function removeStudent(id: string) {
    setStudentIds((prev) => prev.filter((row) => row !== id));
  }

  function handleKindChange(next: CourseKind) {
    setKind(next);
    if (next !== "gruppo") {
      setStudentIds((prev) => prev.slice(0, 1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarnings([]);
    setCreatedId(null);

    const titular =
      isStaff && teachers && teachers.length > 0
        ? titularMemberId
        : actorMemberId;

    const parsedPrice = isStaff
      ? priceEur.trim() === ""
        ? 0
        : Number(priceEur)
      : undefined;

    const result = await createCourse(
      supabase,
      {
        courseKind: kind,
        subjectId,
        titularMemberId: titular,
        studentMemberIds: studentIds,
        roomId: kind === "online" ? null : roomId || null,
        durationMinutes,
        weeklyDow,
        weeklyStartMinute,
        startsOn,
        maxStudents: kind === "gruppo" ? maxStudents : 1,
        priceEur: parsedPrice,
      },
      { memberId: actorMemberId, isStaff, canCreateCourses },
    );

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare il corso.");
      return;
    }

    if (result.warnings?.length) {
      setWarnings(result.warnings);
      setCreatedId(result.id ?? null);
      return;
    }

    if (result.id) {
      router.push(detailHref(result.id));
      router.refresh();
    }
  }

  if (!isStaff && !canCreateCourses) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Non puoi creare corsi in autonomia. Chiedi alla segreteria.
      </p>
    );
  }

  if (!currentTerm) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Imposta prima l’anno corsi
        {isStaff ? (
          <>
            .{" "}
            <Link
              href="/admin/lezioni/impostazioni"
              className="font-medium underline"
            >
              Vai alle impostazioni
            </Link>
          </>
        ) : (
          "."
        )}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Corso creato, con avvisi:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {createdId ? (
            <Link
              href={detailHref(createdId)}
              className="mt-3 inline-block font-medium underline"
            >
              Vai al corso
            </Link>
          ) : null}
        </div>
      ) : null}

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Corso
        </legend>
        <p className="text-sm text-neutral-600">
          Anno corsi: <strong>{currentTerm.label}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo *">
            <select
              value={kind}
              onChange={(e) => handleKindChange(e.target.value as CourseKind)}
              className={inputClass}
            >
              {KINDS.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Materia *">
            <select
              required
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={inputClass}
            >
              {subjects.length === 0 ? (
                <option value="">Nessuna materia</option>
              ) : null}
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </Field>
          {isStaff && teachers && teachers.length > 0 ? (
            <Field label="Titolare *" className="sm:col-span-2">
              <select
                required
                value={titularMemberId}
                onChange={(e) => setTitularMemberId(e.target.value)}
                className={inputClass}
              >
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {kind !== "online" ? (
            <Field label="Sala *">
              <select
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className={inputClass}
              >
                {rooms.length === 0 ? (
                  <option value="">Nessuna sala</option>
                ) : null}
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Durata *">
            <select
              value={durationMinutes}
              onChange={(e) =>
                setDurationMinutes(Number(e.target.value) as CourseDurationMinutes)
              }
              className={inputClass}
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minuti
                </option>
              ))}
            </select>
          </Field>
          <Field label="Giorno *">
            <select
              value={weeklyDow}
              onChange={(e) =>
                setWeeklyDow(Number(e.target.value) as IsoWeekday)
              }
              className={inputClass}
            >
              {weekdays.map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_LABELS[day]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orario *">
            <select
              value={weeklyStartMinute}
              onChange={(e) => setWeeklyStartMinute(Number(e.target.value))}
              className={inputClass}
            >
              {startMinutes.map((minute) => (
                <option key={minute} value={minute}>
                  {minutesToTimeLabel(minute)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data inizio *">
            <input
              type="date"
              required
              min={currentTerm.startsOn}
              max={currentTerm.endsOn}
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className={inputClass}
            />
          </Field>
          {kind === "gruppo" ? (
            <Field label="Capienza massima">
              <input
                type="number"
                min={1}
                value={maxStudents}
                onChange={(e) => {
                  const next = Number(e.target.value) || 1;
                  setMaxStudents(next);
                  setStudentIds((prev) => prev.slice(0, next));
                }}
                className={inputClass}
              />
            </Field>
          ) : null}
          {isStaff ? (
            <Field label="Prezzo (€)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceEur}
                onChange={(e) => setPriceEur(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Allievi
        </legend>
        <p className="text-sm text-neutral-600">
          {kind === "gruppo"
            ? `Seleziona da 1 a ${maxSelectable} allievi.`
            : "Seleziona un allievo."}
        </p>
        {selectedStudents.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {selectedStudents.map((student) => (
              <li
                key={student.id}
                className="flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-800"
              >
                {memberLabel(student)}
                <button
                  type="button"
                  onClick={() => removeStudent(student.id)}
                  className="text-neutral-500 hover:text-neutral-900"
                  aria-label={`Rimuovi ${memberLabel(student)}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {studentIds.length < maxSelectable ? (
          <div>
            <input
              type="search"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Cerca associato…"
              className={inputClass}
            />
            <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              {studentMatches.length === 0 ? (
                <li className="px-3 py-2 text-sm text-neutral-500">
                  Nessun associato trovato.
                </li>
              ) : (
                studentMatches.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => addStudent(member.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                    >
                      <span>{memberLabel(member)}</span>
                      {member.email ? (
                        <span className="text-neutral-400">{member.email}</span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Creazione…" : "Crea corso"}
        </button>
        <Link
          href={listHref}
          className="text-sm text-[var(--brand)] hover:underline"
        >
          Annulla
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
