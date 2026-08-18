import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listLessonsInRange,
  listLessonsOnDate,
  listMemberLabelsWithRole,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsOggi } from "@/components/lezioni/lessons-oggi";
import { TeacherAbsentActions } from "@/components/lezioni/teacher-absent-actions";
import { UnplacedLessonsBlock } from "@/components/lezioni/unplaced-lessons-block";
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
  const [lessons, arrearsRange, teachers, rooms] = await Promise.all([
    listLessonsOnDate(supabase, today, {
      includePendingHold: true,
    }),
    listLessonsInRange(supabase, {
      from: addRomeDays(today, -14),
      to: today,
    }),
    listMemberLabelsWithRole(supabase, MemberRole.Docente),
    listRooms(supabase),
  ]);
  const arrears = arrearsRange.filter(
    (lesson) =>
      !lesson.hasAttendance &&
      !lesson.id.startsWith("hold:") &&
      lesson.courseStatus !== "in_attesa",
  );

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Link
          href={`/admin/lezioni/calendario?view=week&date=${today}&hl=${today}`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 touch-manipulation"
        >
          Apri calendario
        </Link>
      </div>

      <div className="space-y-6">
        <LessonsOggi
          lessons={lessons}
          arrears={arrears}
          courseDetailBasePath="/admin/lezioni/corsi"
          actorMemberId={member.id}
          isStaff
        />

        <UnplacedLessonsBlock
          actor={{
            memberId: member.id,
            isStaff: true,
            canReschedule: true,
          }}
          rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
          courseDetailBaseHref="/admin/lezioni/corsi"
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

function addRomeDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
