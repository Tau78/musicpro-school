import { redirect } from "next/navigation";

import {
  listLessonsInRange,
  listLessonsOnDate,
  listMemberLabelsWithRole,
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
  const [lessons, arrearsRange, teachers] = await Promise.all([
    listLessonsOnDate(supabase, today, {
      includePendingHold: true,
    }),
    listLessonsInRange(supabase, {
      from: addRomeDays(today, -14),
      to: today,
    }),
    listMemberLabelsWithRole(supabase, MemberRole.Docente),
  ]);
  const arrears = arrearsRange.filter(
    (lesson) =>
      !lesson.hasAttendance &&
      !lesson.id.startsWith("hold:") &&
      lesson.courseStatus !== "in_attesa",
  );

  return (
    <div className="space-y-6">
      <LessonsOggi
        lessons={lessons}
        arrears={arrears}
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
  );
}

function addRomeDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
