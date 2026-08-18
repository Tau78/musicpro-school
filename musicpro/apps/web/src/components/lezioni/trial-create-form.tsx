"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createTrial,
  romeLocalInputToUtcIso,
} from "@musicpro/database";

import type {
  CourseCreateFormTeacher,
  CourseCreateFormTerm,
} from "@/components/lezioni/course-create-form";
import { createClient } from "@/lib/supabase/client";

export interface TrialCreateFormProps {
  actorMemberId: string;
  isStaff: boolean;
  canCreateCourses: boolean;
  subjects: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  currentTerm: CourseCreateFormTerm | null;
  teachers?: CourseCreateFormTeacher[];
  slotStepMinutes?: number;
}

const DURATIONS = [30, 45, 60] as const;
type TrialDuration = (typeof DURATIONS)[number];

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

/** Stessa soglia di iscrizione.html: 365.25 giorni. */
function ageFromBirthDate(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / 31_557_600_000);
}

export function TrialCreateForm({
  actorMemberId,
  isStaff,
  canCreateCourses,
  subjects,
  rooms,
  currentTerm,
  teachers,
  slotStepMinutes = 15,
}: TrialCreateFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const listHref = isStaff ? "/admin/lezioni/corsi" : "/lezioni/corsi";
  const detailHref = (id: string) =>
    isStaff ? `/admin/lezioni/corsi/${id}` : `/lezioni/corsi/${id}`;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [tutorFirstName, setTutorFirstName] = useState("");
  const [tutorLastName, setTutorLastName] = useState("");
  const [tutorEmail, setTutorEmail] = useState("");
  const [tutorPhone, setTutorPhone] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [durationMinutes, setDurationMinutes] = useState<TrialDuration>(30);
  const [startsLocal, setStartsLocal] = useState("");
  const [online, setOnline] = useState(false);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [titularMemberId, setTitularMemberId] = useState(
    teachers && teachers.length > 0 ? teachers[0].id : actorMemberId,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const age = ageFromBirthDate(birthDate);
  const isMinor = age != null && age < 18;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarnings([]);
    setCreatedId(null);

    if (isMinor) {
      if (
        !tutorFirstName.trim() ||
        !tutorLastName.trim() ||
        !tutorEmail.trim() ||
        !tutorPhone.trim()
      ) {
        setSaving(false);
        setError("Per i minori servono nome, cognome, email e telefono del tutore.");
        return;
      }
    }

    if (!online && !roomId) {
      setSaving(false);
      setError("Seleziona una sala per la prova in presenza.");
      return;
    }

    let startsAt: string;
    try {
      startsAt = romeLocalInputToUtcIso(startsLocal);
    } catch {
      setSaving(false);
      setError("Data e ora della prova non valide.");
      return;
    }

    const titular =
      isStaff && teachers && teachers.length > 0
        ? titularMemberId
        : actorMemberId;

    const result = await createTrial(
      supabase,
      {
        subjectId,
        titularMemberId: titular,
        startsAt,
        durationMinutes,
        roomId: online ? null : roomId || null,
        online,
        student: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          birthDate: birthDate || null,
          tutorFirstName: isMinor ? tutorFirstName.trim() : undefined,
          tutorLastName: isMinor ? tutorLastName.trim() : undefined,
          tutorEmail: isMinor ? tutorEmail.trim() : undefined,
          tutorPhone: isMinor ? tutorPhone.trim() : undefined,
        },
      },
      { memberId: actorMemberId, isStaff, canCreateCourses },
    );

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare la prova.");
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
        Non puoi creare prove in autonomia. Chiedi alla segreteria.
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
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Prova creata, con avvisi:</p>
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
              Vai alla prova
            </Link>
          ) : null}
        </div>
      ) : null}

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Allievo
        </legend>
        <p className="text-sm text-neutral-600">
          Prova gratuita · anno corsi <strong>{currentTerm.label}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *">
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Cognome *">
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
              autoComplete="family-name"
            />
          </Field>
          <Field label="Email *">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </Field>
          <Field label="Telefono *">
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              autoComplete="tel"
            />
          </Field>
          <Field label="Data di nascita *">
            <input
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      {isMinor ? (
        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Tutore
          </legend>
          <p className="text-sm text-neutral-600">
            L’allievo ha meno di 18 anni: i dati del tutore sono obbligatori.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome tutore *">
              <input
                required
                value={tutorFirstName}
                onChange={(e) => setTutorFirstName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Cognome tutore *">
              <input
                required
                value={tutorLastName}
                onChange={(e) => setTutorLastName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Email tutore *">
              <input
                type="email"
                required
                value={tutorEmail}
                onChange={(e) => setTutorEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Telefono tutore *">
              <input
                type="tel"
                required
                value={tutorPhone}
                onChange={(e) => setTutorPhone(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Slot
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field label="Durata *">
            <select
              value={durationMinutes}
              onChange={(e) =>
                setDurationMinutes(Number(e.target.value) as TrialDuration)
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
          <Field label="Data e ora *" className="sm:col-span-2">
            <input
              type="datetime-local"
              required
              step={slotStepMinutes * 60}
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
              className={inputClass}
            />
          </Field>
          {isStaff && teachers && teachers.length > 0 ? (
            <Field label="Docente *" className="sm:col-span-2">
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
          <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={online}
              onChange={(e) => setOnline(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)]"
            />
            Online (niente sala)
          </label>
          {!online ? (
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
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Creazione…" : "Crea prova"}
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
