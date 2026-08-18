"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  cancelTrial,
  convertTrialToCourse,
  rescheduleTrial,
  romeLocalInputToUtcIso,
  sendTrialWelcomeEmail,
  utcIsoToRomeLocalInput,
  type CourseDetail,
  type Lesson,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export interface TrialActionsProps {
  course: CourseDetail;
  lessons: Lesson[];
  rooms: { id: string; name: string }[];
  actorMemberId: string;
  isStaff: boolean;
  canCreateCourses: boolean;
}

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

export function TrialActions({
  course,
  lessons,
  rooms,
  actorMemberId,
  isStaff,
  canCreateCourses,
}: TrialActionsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const listHref = isStaff ? "/admin/lezioni/corsi" : "/lezioni/corsi";
  const detailHref = (id: string) =>
    isStaff ? `/admin/lezioni/corsi/${id}` : `/lezioni/corsi/${id}`;

  const trialLesson = lessons.find((row) => row.kind === "prova") ?? lessons[0];
  const online = course.courseKind === "online";
  const convertedId = course.convertedToCourseId;

  const [startsLocal, setStartsLocal] = useState(() =>
    trialLesson?.startsAt ? utcIsoToRomeLocalInput(trialLesson.startsAt) : "",
  );
  const [roomId, setRoomId] = useState(
    trialLesson?.roomId ?? course.roomId ?? rooms[0]?.id ?? "",
  );
  const [busy, setBusy] = useState<
    "reschedule" | "cancel" | "convert" | "email" | "pay" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const actor = { memberId: actorMemberId, isStaff, canCreateCourses };

  async function handlePaymentLink(convertedCourseId: string) {
    setError(null);
    setNotice(null);
    setBusy("pay");

    const { data: enrollment, error: enrollError } = await supabase
      .from("course_enrollments")
      .select("id")
      .eq("course_id", convertedCourseId)
      .is("left_at", null)
      .limit(1)
      .maybeSingle();

    if (enrollError || !enrollment) {
      setBusy(null);
      setError(
        enrollError?.message ||
          "Iscrizione al corso convertito non trovata. Usa Rette per il link.",
      );
      return;
    }

    let payload: { url?: string; message?: string } = {};
    try {
      const res = await fetch("/api/lezioni/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: enrollment.id }),
      });
      payload = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !payload.url) {
        setBusy(null);
        setError(payload.message ?? "Impossibile creare il link di pagamento.");
        return;
      }
    } catch {
      setBusy(null);
      setError("Impossibile creare il link di pagamento.");
      return;
    }

    setBusy(null);
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  if (!course.isTrial) return null;

  if (convertedId) {
    return (
      <fieldset className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Prova
        </legend>
        <p className="text-sm text-neutral-700">
          Questa prova è stata convertita in un corso.
        </p>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={detailHref(convertedId)}
            className="inline-flex items-center text-sm font-medium text-[var(--brand)] hover:underline"
          >
            Vai al corso
          </Link>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void handlePaymentLink(convertedId)}
            className="rounded-lg border border-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-50"
          >
            {busy === "pay" ? "Creo il link…" : "Link di pagamento"}
          </button>
          {isStaff ? (
            <Link
              href="/admin/lezioni/rette"
              className="inline-flex items-center text-sm text-neutral-600 hover:underline"
            >
              Rette
            </Link>
          ) : null}
        </div>
      </fieldset>
    );
  }

  async function handleReschedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!startsLocal) {
      setError("Inserisci data e ora.");
      return;
    }
    if (!online && !roomId) {
      setError("Seleziona una sala.");
      return;
    }

    let startsAt: string;
    try {
      startsAt = romeLocalInputToUtcIso(startsLocal);
    } catch {
      setError("Data e ora non valide.");
      return;
    }

    setBusy("reschedule");
    const result = await rescheduleTrial(
      supabase,
      course.id,
      startsAt,
      online ? null : roomId || null,
      actor,
    );
    setBusy(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile riprogrammare la prova.");
      return;
    }
    if (result.warnings?.length) {
      setNotice(result.warnings.join(" "));
    }
    router.refresh();
  }

  async function handleCancel() {
    if (
      !window.confirm(
        "Annullare questa prova? La sala si libera. La bozza in rubrica resta 30 giorni.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("cancel");
    const result = await cancelTrial(supabase, course.id, actor);
    setBusy(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile annullare la prova.");
      return;
    }
    router.push(listHref);
    router.refresh();
  }

  async function handleConvert() {
    if (
      !window.confirm(
        "Convertire questa prova in un corso? Il corso sarà già attivo.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("convert");
    const result = await convertTrialToCourse(supabase, course.id, actor);
    setBusy(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile convertire la prova.");
      return;
    }
    if (result.warnings?.length) {
      setNotice(result.warnings.join(" "));
    }
    if (result.id) {
      router.push(detailHref(result.id));
    }
    router.refresh();
  }

  async function handleResendEmail() {
    setError(null);
    setNotice(null);
    setBusy("email");
    const result = await sendTrialWelcomeEmail(supabase, course.id);
    setBusy(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile inviare l’email.");
      return;
    }
    setNotice(
      result.warnings?.length
        ? result.warnings.join(" ")
        : "Email di benvenuto inviata.",
    );
  }

  return (
    <fieldset className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/40 p-6">
      <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
        Prova
      </legend>
      <p className="text-sm text-neutral-600">
        Prova gratuita, una sola riprogrammazione in caso di no-show.
      </p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      ) : null}

      {!course.trialRescheduleUsed ? (
        <form
          onSubmit={(event) => void handleReschedule(event)}
          className="space-y-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Riprogramma
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              Data e ora
              <input
                type="datetime-local"
                required
                step={15 * 60}
                value={startsLocal}
                disabled={busy != null}
                onChange={(e) => setStartsLocal(e.target.value)}
                className={inputClass}
              />
            </label>
            {!online ? (
              <label className="flex flex-col gap-1 text-xs text-neutral-600">
                Sala
                <select
                  required
                  value={roomId}
                  disabled={busy != null}
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
              </label>
            ) : (
              <p className="pb-2 text-sm text-neutral-500">Online</p>
            )}
            <button
              type="submit"
              disabled={busy != null}
              className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {busy === "reschedule" ? "Sposto…" : "Riprogramma"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-neutral-500">
          Riprogrammazione già usata.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void handleConvert()}
          className="rounded-lg border border-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-50"
        >
          {busy === "convert" ? "Converto…" : "Converti in corso"}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void handleResendEmail()}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {busy === "email" ? "Invio…" : "Reinvia email"}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void handleCancel()}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === "cancel" ? "Annullamento…" : "Annulla prova"}
        </button>
      </div>
    </fieldset>
  );
}
