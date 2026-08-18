import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listLessonsOnDate,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsOggi } from "@/components/lezioni/lessons-oggi";
import { TeacherAbsentActions } from "@/components/lezioni/teacher-absent-actions";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniOggiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const today = todayInRome();
  const lessons = await listLessonsOnDate(supabase, today, {
    titularMemberId: member.id,
    includePendingHold: true,
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--brand)]">Oggi</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Le tue lezioni di oggi. Tocca una riga per il registro.
          </p>
        </div>
        <Link
          href={`/lezioni/calendario?view=week&date=${today}&hl=${today}`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
        >
          Apri calendario
        </Link>
      </div>

      <div className="space-y-6">
        <LessonsOggi
          lessons={lessons}
          courseDetailBasePath="/lezioni/corsi"
          actorMemberId={member.id}
          isStaff={false}
        />

        <TeacherAbsentActions
          actorMemberId={member.id}
          isStaff={false}
          teacherId={member.id}
        />
      </div>
    </div>
  );
}
