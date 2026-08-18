import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listLessonsOnDate,
  listMemberIdsWithRole,
  listMembers,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsOggi } from "@/components/lezioni/lessons-oggi";
import { TeacherAbsentActions } from "@/components/lezioni/teacher-absent-actions";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLezioniOggiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/oggi"
        : "/admin/rimborsi",
    );
  }

  const today = todayInRome();
  const [lessons, docenteIds, members] = await Promise.all([
    listLessonsOnDate(supabase, today, {
      includePendingHold: true,
    }),
    listMemberIdsWithRole(supabase, MemberRole.Docente),
    listMembers(supabase),
  ]);

  const docenteIdSet = new Set(docenteIds);
  const teachers = members
    .filter((row) => docenteIdSet.has(row.id))
    .map((row) => ({
      id: row.id,
      label: `${row.lastName} ${row.firstName}`.trim(),
    }));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--brand)]">Oggi</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Tutte le lezioni di oggi. Tocca una riga per il registro.
          </p>
        </div>
        <Link
          href={`/admin/lezioni/calendario?view=week&date=${today}&hl=${today}`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
        >
          Apri calendario
        </Link>
      </div>

      <div className="space-y-6">
        <LessonsOggi
          lessons={lessons}
          courseDetailBasePath="/admin/lezioni/corsi"
          actorMemberId={member.id}
          isStaff
        />

        <TeacherAbsentActions
          actorMemberId={member.id}
          isStaff
          teachers={teachers}
        />
      </div>
    </div>
  );
}
