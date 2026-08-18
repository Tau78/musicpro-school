import { redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  listMemberLabelsWithRole,
  listTeacherAvailability,
  listTeacherTimeOff,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { TeacherAvailabilityPanel } from "@/components/lezioni/teacher-availability-panel";
import { TeacherSelect } from "@/components/lezioni/teacher-select";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{ docente?: string }>;
}

export default async function AdminLezioniDisponibilitaPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  const { docente: docenteParam } = await searchParams;

  const [teachers, settings] = await Promise.all([
    listMemberLabelsWithRole(supabase, MemberRole.Docente),
    getLessonSchoolSettings(supabase),
  ]);

  const selectedId =
    (docenteParam && teachers.some((row) => row.id === docenteParam)
      ? docenteParam
      : teachers[0]?.id) ?? "";

  const selectedTeacher = teachers.find((row) => row.id === selectedId);

  const [slots, timeOff] = selectedId
    ? await Promise.all([
        listTeacherAvailability(supabase, selectedId),
        listTeacherTimeOff(supabase, selectedId),
      ])
    : [[], []];

  return (
    <div>
      {teachers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
          Nessun docente in rubrica.
        </p>
      ) : (
        <div className="space-y-6">
          <TeacherSelect teachers={teachers} selectedId={selectedId} />

          {selectedTeacher ? (
            <p className="text-sm text-neutral-600">
              Stai modificando la disponibilità di{" "}
              <span className="font-medium text-neutral-900">
                {selectedTeacher.label}
              </span>
              .
            </p>
          ) : null}

          <TeacherAvailabilityPanel
            key={selectedId}
            memberId={selectedId}
            initialSlots={slots}
            initialTimeOff={timeOff}
            sundayVisible={settings?.sundayVisible ?? false}
            gridOpenMinute={settings?.gridOpenMinute ?? 600}
            gridCloseMinute={settings?.gridCloseMinute ?? 1380}
          />
        </div>
      )}
    </div>
  );
}
