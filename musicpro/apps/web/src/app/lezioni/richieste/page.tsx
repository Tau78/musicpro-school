import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listIntentsForTeacher,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { EnrollmentLessonIntentsList } from "@/components/lezioni/enrollment-lesson-intents-list";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniRichiestePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/dashboard");
  }

  let items: Awaited<ReturnType<typeof listIntentsForTeacher>> = [];
  let loadError: string | null = null;

  try {
    items = await listIntentsForTeacher(supabase);
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : "Impossibile caricare le richieste.";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--brand)] sm:text-4xl">
          Richieste iscrizione
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Allievi che ti hanno scelto come docente preferito o corsi convertiti
          di cui sei titolare. Per pagamenti e riconciliazione contatta la
          segreteria.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </p>
      ) : (
        <EnrollmentLessonIntentsList items={items} mode="teacher" />
      )}
    </div>
  );
}
