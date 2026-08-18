import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getTeacherProfile,
  listLessonsInRange,
  listLessonsOnDate,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsOggi } from "@/components/lezioni/lessons-oggi";
import { TeacherAbsentActions } from "@/components/lezioni/teacher-absent-actions";
import { UnplacedLessonsBlock } from "@/components/lezioni/unplaced-lessons-block";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniOggiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const today = todayInRome();
  const [lessons, arrearsRange, profile, rooms] = await Promise.all([
    listLessonsOnDate(supabase, today, {
      titularMemberId: member.id,
      includePendingHold: true,
    }),
    listLessonsInRange(supabase, {
      from: addRomeDays(today, -14),
      to: today,
      titularMemberId: member.id,
    }),
    getTeacherProfile(supabase, member.id),
    listRooms(supabase),
  ]);
  const arrears = arrearsRange.filter(
    (lesson) =>
      !lesson.hasAttendance &&
      !lesson.id.startsWith("hold:") &&
      lesson.courseStatus !== "in_attesa",
  );
  const canReschedule = profile?.canReschedule ?? false;

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Link
          href={`/lezioni/calendario?view=week&date=${today}&hl=${today}`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 touch-manipulation"
        >
          Apri calendario
        </Link>
      </div>

      <div className="space-y-6">
        <LessonsOggi
          lessons={lessons}
          arrears={arrears}
          courseDetailBasePath="/lezioni/corsi"
          actorMemberId={member.id}
          isStaff={false}
        />

        {canReschedule ? (
          <UnplacedLessonsBlock
            actor={{
              memberId: member.id,
              isStaff: false,
              canReschedule: true,
            }}
            rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
            courseDetailBaseHref="/lezioni/corsi"
            titularMemberId={member.id}
          />
        ) : null}

        <TeacherAbsentActions
          actorMemberId={member.id}
          isStaff={false}
          teacherId={member.id}
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
