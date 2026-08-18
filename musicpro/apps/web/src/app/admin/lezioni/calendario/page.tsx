import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  listBookingsInRange,
  listExternalCalendarEventsInRange,
  listLessonsInRange,
  listMemberLabelsWithRole,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { mergeCalendarEvents } from "@/components/lezioni/calendar-bookings";
import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { UnplacedLessonsBlock } from "@/components/lezioni/unplaced-lessons-block";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import {
  isIsoDate,
  monthBounds,
  parseCalendarMode,
  parseCalendarView,
  weekBounds,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    docente?: string;
    sala?: string;
    modo?: string;
    hl?: string;
  }>;
}

export default async function AdminLezioniCalendarioPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/calendario"
        : "/admin/rimborsi",
    );
  }

  const params = await searchParams;
  const today = todayInRome();
  const view = parseCalendarView(params.view);
  const mode = parseCalendarMode(params.modo);
  const anchorDate = isIsoDate(params.date) ? params.date : today;
  const highlightDay = isIsoDate(params.hl) ? params.hl : null;

  const [settings, rooms, teachers] = await Promise.all([
    getLessonSchoolSettings(supabase),
    listRooms(supabase),
    listMemberLabelsWithRole(supabase, MemberRole.Docente),
  ]);

  const roomOptions = rooms.map((room) => ({ id: room.id, name: room.name }));
  const teacherId =
    params.docente && teachers.some((row) => row.id === params.docente)
      ? params.docente
      : null;
  const roomId =
    params.sala && roomOptions.some((row) => row.id === params.sala)
      ? params.sala
      : null;

  const sundayVisible = settings?.sundayVisible ?? false;
  const bounds =
    view === "month"
      ? monthBounds(anchorDate)
      : weekBounds(anchorDate, sundayVisible);

  const roomFilter = mode === "sala" && roomId ? roomId : undefined;
  const [lessons, bookings, externals] = await Promise.all([
    listLessonsInRange(supabase, {
      from: bounds.from,
      to: bounds.to,
      includePendingHold: true,
      titularMemberId:
        mode === "docente" && teacherId ? teacherId : undefined,
      roomId: roomFilter,
    }),
    listBookingsInRange(supabase, {
      from: bounds.from,
      to: bounds.to,
      roomId: roomFilter,
    }),
    listExternalCalendarEventsInRange(supabase, {
      from: bounds.from,
      to: bounds.to,
      roomId: roomFilter,
    }),
  ]);

  return (
    <div className="space-y-3">
      <Suspense fallback={null}>
        <UnplacedLessonsBlock
          actor={{
            memberId: member.id,
            isStaff: true,
            canReschedule: true,
          }}
          rooms={roomOptions}
          courseDetailBaseHref="/admin/lezioni/corsi"
        />
      </Suspense>

      <LessonsCalendarPage
        initialLessons={mergeCalendarEvents(lessons, bookings, externals)}
        settings={{
          sundayVisible,
          gridOpenMinute: settings?.gridOpenMinute ?? 600,
          gridCloseMinute: settings?.gridCloseMinute ?? 1380,
          slotGranularityMinutes: settings?.slotGranularityMinutes ?? 15,
        }}
        rooms={roomOptions}
        teachers={teachers}
        initialTeacherId={teacherId}
        initialRoomId={roomId}
        initialView={view}
        initialDate={anchorDate}
        initialMode={mode}
        isStaff
        canDrag
        courseDetailBasePath="/admin/lezioni/corsi"
        today={today}
        highlightDay={highlightDay}
        memberId={member.id}
      />
    </div>
  );
}
