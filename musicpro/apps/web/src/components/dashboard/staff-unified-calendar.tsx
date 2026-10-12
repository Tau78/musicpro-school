import {
  getLessonSchoolSettings,
  listMemberLabelsWithRole,
  listRooms,
  listRoomsForLessons,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import type { CalendarScope } from "@/components/lezioni/lessons-calendar-page";
import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { loadUnifiedCalendarEvents } from "@/lib/dashboard/load-unified-calendar";
import {
  calendarBounds,
  isIsoDate,
  parseCalendarScope,
  parseCalendarView,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

export async function StaffUnifiedCalendar({
  memberId,
  searchParams,
  showStaffLessons,
  showBookingsCalendar,
  showTeacherLessons,
  lockTeacherId = null,
}: {
  memberId: string;
  searchParams: {
    view?: string;
    date?: string;
    sala?: string;
    docente?: string;
    ambito?: string;
    hl?: string;
  };
  showStaffLessons: boolean;
  showBookingsCalendar: boolean;
  showTeacherLessons: boolean;
  lockTeacherId?: string | null;
}) {
  const supabase = await createClient();
  const today = todayInRome();
  const view = parseCalendarView(searchParams.view);
  const anchorDate = isIsoDate(searchParams.date) ? searchParams.date : today;
  const highlightDay = isIsoDate(searchParams.hl) ? searchParams.hl : null;

  const availableScopes: CalendarScope[] = [];
  if (showStaffLessons && showBookingsCalendar) {
    availableScopes.push("tutto", "lezioni", "prenotazioni");
  } else if (showStaffLessons) {
    availableScopes.push("lezioni");
  } else if (showBookingsCalendar) {
    availableScopes.push("prenotazioni");
  } else if (showTeacherLessons) {
    availableScopes.push("lezioni");
  }

  let scope = parseCalendarScope(searchParams.ambito);
  if (!availableScopes.includes(scope)) {
    scope = availableScopes[0] ?? "tutto";
  }

  const [settings, rooms, teachers] = await Promise.all([
    getLessonSchoolSettings(supabase),
    showStaffLessons
      ? listRoomsForLessons(supabase)
      : showBookingsCalendar
        ? listRooms(supabase)
        : Promise.resolve([]),
    showStaffLessons
      ? listMemberLabelsWithRole(supabase, MemberRole.Docente)
      : Promise.resolve([]),
  ]);

  const roomOptions = rooms.map((room) => ({ id: room.id, name: room.name }));
  const teacherId =
    lockTeacherId ??
    (searchParams.docente &&
    teachers.some((row) => row.id === searchParams.docente)
      ? searchParams.docente
      : null);
  const roomId =
    searchParams.sala &&
    roomOptions.some((row) => row.id === searchParams.sala)
      ? searchParams.sala
      : null;

  const sundayVisible = settings?.sundayVisible ?? false;
  void calendarBounds(view, anchorDate, sundayVisible);

  const initialLessons = await loadUnifiedCalendarEvents(supabase, {
    view,
    anchorDate,
    sundayVisible,
    scope,
    roomId,
    teacherId,
    includeLessons: showStaffLessons || showTeacherLessons,
    includeBookings: showBookingsCalendar,
    teacherMemberId:
      showTeacherLessons && !showStaffLessons ? memberId : undefined,
  });

  const courseDetailBasePath = showStaffLessons
    ? "/admin/lezioni/corsi"
    : "/lezioni/corsi";

  return (
    <LessonsCalendarPage
        initialLessons={initialLessons}
        settings={{
          sundayVisible,
          gridOpenMinute: settings?.gridOpenMinute ?? 600,
          gridCloseMinute: settings?.gridCloseMinute ?? 1380,
          slotGranularityMinutes: settings?.slotGranularityMinutes ?? 15,
        }}
        rooms={roomOptions}
        bookingRooms={showBookingsCalendar ? rooms : []}
        teachers={teachers}
        initialTeacherId={teacherId}
        initialRoomId={roomId}
        initialView={view}
        initialDate={anchorDate}
        initialScope={scope}
        availableScopes={availableScopes}
        filterLayout="unified"
        lockTeacherId={lockTeacherId}
        isStaff={showStaffLessons || showBookingsCalendar}
        canDrag={showStaffLessons || showTeacherLessons}
        courseDetailBasePath={courseDetailBasePath}
        today={today}
        highlightDay={highlightDay}
        memberId={memberId}
      />
  );
}
