import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getLessonSchoolSettings,
  getTeacherProfile,
  listLessonsInRange,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { UnplacedLessonsBlock } from "@/components/lezioni/unplaced-lessons-block";
import {
  isIsoDate,
  monthBounds,
  parseCalendarView,
  weekBounds,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    hl?: string;
  }>;
}

export default async function LezioniCalendarioPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const params = await searchParams;
  const today = todayInRome();
  const view = parseCalendarView(params.view);
  const anchorDate = isIsoDate(params.date) ? params.date : today;
  const highlightDay = isIsoDate(params.hl) ? params.hl : null;

  const [settings, rooms, profile] = await Promise.all([
    getLessonSchoolSettings(supabase),
    listRooms(supabase),
    getTeacherProfile(supabase, member.id),
  ]);

  const sundayVisible = settings?.sundayVisible ?? false;
  const bounds =
    view === "month"
      ? monthBounds(anchorDate)
      : weekBounds(anchorDate, sundayVisible);

  const lessons = await listLessonsInRange(supabase, {
    from: bounds.from,
    to: bounds.to,
    titularMemberId: member.id,
    includePendingHold: true,
  });

  return (
    <div className="space-y-3">
      {profile?.canReschedule ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      <LessonsCalendarPage
        initialLessons={lessons}
        settings={{
          sundayVisible,
          gridOpenMinute: settings?.gridOpenMinute ?? 600,
          gridCloseMinute: settings?.gridCloseMinute ?? 1380,
        }}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        initialView={view}
        initialDate={anchorDate}
        isStaff={false}
        canDrag={profile?.canReschedule ?? false}
        courseDetailBasePath="/lezioni/corsi"
        today={today}
        highlightDay={highlightDay}
        memberId={member.id}
      />
    </div>
  );
}
