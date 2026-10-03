import { redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  listMemberLabelsWithRole,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { loadUnifiedCalendarEvents } from "@/lib/dashboard/load-unified-calendar";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import {
  calendarBounds,
  isIsoDate,
  parseCalendarScope,
  parseCalendarView,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    docente?: string;
    sala?: string;
    ambito?: string;
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
  const scope = parseCalendarScope(params.ambito);
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
  const bounds = calendarBounds(view, anchorDate, sundayVisible);

  const initialLessons = await loadUnifiedCalendarEvents(supabase, {
    view,
    anchorDate,
    sundayVisible,
    scope,
    roomId,
    teacherId,
    includeLessons: true,
    includeBookings: true,
  });

  return (
    <div>
      <LessonsCalendarPage
        initialLessons={initialLessons}
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
        initialScope={scope}
        filterLayout="unified"
        isStaff
        canDrag
        courseDetailBasePath="/admin/lezioni/corsi"
        today={today}
        highlightDay={highlightDay}
        memberId={member.id}
        bookingRooms={rooms}
      />
    </div>
  );
}
