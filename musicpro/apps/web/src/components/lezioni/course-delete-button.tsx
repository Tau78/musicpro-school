"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  adminDeleteCourse,
  getCourseDeletePreview,
  type CourseDetail,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export function CourseDeleteButton({
  course,
  actorMemberId,
  backHref,
}: {
  course: CourseDetail;
  actorMemberId: string;
  backHref: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    const preview = await getCourseDeletePreview(supabase, course.id);
    setBusy(false);

    if (!preview.canDelete) {
      setError(preview.blockReason ?? "Impossibile eliminare il corso.");
      return;
    }

    let purgeProgramming = false;
    if (preview.activeLessonCount > 0) {
      const okProgramming = window.confirm(
        `Il corso ha ${preview.activeLessonCount} lezioni in programmazione. Cancello la programmazione?`,
      );
      if (!okProgramming) return;
      purgeProgramming = true;
    }

    const okFinal = window.confirm(
      `Vuoi davvero eliminare il corso «${course.name}»? L'operazione non si può annullare.`,
    );
    if (!okFinal) return;

    setBusy(true);
    const result = await adminDeleteCourse(
      supabase,
      course.id,
      { memberId: actorMemberId, isStaff: true },
      { purgeProgramming },
    );
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare il corso.");
      return;
    }

    router.push(backHref);
    router.refresh();
  }

  return (
    <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
        Zona pericolosa
      </h3>
      {error ? (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <p className="mb-2 text-sm text-neutral-600">
        Elimina il corso solo se creato per errore e senza presenze o pagamenti
        registrati.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleDelete()}
        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Eliminazione…" : "Elimina corso"}
      </button>
    </section>
  );
}
