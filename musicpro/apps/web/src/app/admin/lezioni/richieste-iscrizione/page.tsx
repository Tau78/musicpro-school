import { redirect } from "next/navigation";

import { listIntentsForStaff } from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { EnrollmentLessonIntentsList } from "@/components/lezioni/enrollment-lesson-intents-list";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminRichiesteIscrizioneLezioniPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/richieste"
        : "/admin/rimborsi",
    );
  }

  let items: Awaited<ReturnType<typeof listIntentsForStaff>> = [];
  let loadError: string | null = null;

  try {
    items = await listIntentsForStaff(supabase);
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : "Impossibile caricare le richieste di iscrizione.";
  }

  const openCount = items.filter((row) => row.paymentState !== "converted")
    .length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand)]">
          Richieste iscrizione lezioni
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Scelte corso e docente durante l&apos;iscrizione associativa, con
          stato pagamento e modulo.{" "}
          {openCount > 0 ? (
            <span className="font-medium text-amber-800">
              {openCount}{" "}
              {openCount === 1 ? "richiesta aperta" : "richieste aperte"}.
            </span>
          ) : (
            <span className="text-neutral-500">Nessuna richiesta in sospeso.</span>
          )}
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </p>
      ) : (
        <EnrollmentLessonIntentsList
          items={items}
          mode="staff"
          actorMemberId={member.id}
        />
      )}
    </div>
  );
}
