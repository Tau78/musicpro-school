"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateEnrollmentLessonIntentPreferredTeacher } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export function EnrollmentLessonIntentTeacherSelect({
  intentId,
  requestedCourseId,
  preferredTeacherMemberId,
  teachers,
  disabled,
}: {
  intentId: string;
  requestedCourseId: string;
  preferredTeacherMemberId: string | null;
  teachers: { memberId: string; label: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(preferredTeacherMemberId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = teachers.filter(
    (t) => t.memberId && t.label.trim().length > 0,
  );

  async function onChange(nextRaw: string) {
    const next = nextRaw.trim();
    setValue(next);
    setError(null);
    setBusy(true);
    const result = await updateEnrollmentLessonIntentPreferredTeacher(
      supabase,
      intentId,
      next || null,
    );
    setBusy(false);
    if (!result.success) {
      setError(result.errorMessage || "Salvataggio non riuscito.");
      setValue(preferredTeacherMemberId ?? "");
      return;
    }
    router.refresh();
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Docente preferito: nessun docente sul corso{" "}
        <span className="sr-only">{requestedCourseId}</span>
      </p>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <label
        htmlFor={`intent-teacher-${intentId}`}
        className="text-sm text-neutral-600"
      >
        Docente preferito
      </label>
      <select
        id={`intent-teacher-${intentId}`}
        value={value}
        disabled={disabled || busy}
        onChange={(e) => void onChange(e.target.value)}
        className="min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900"
      >
        <option value="">— Nessuna preferenza —</option>
        {options.map((t) => (
          <option key={t.memberId} value={t.memberId}>
            {t.label}
          </option>
        ))}
      </select>
      {busy ? (
        <span className="text-xs text-neutral-500">Salvo…</span>
      ) : null}
      {error ? (
        <span className="text-xs text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
