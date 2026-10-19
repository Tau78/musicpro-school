import { redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  listBookingsInRange,
  listExternalCalendarEventsInRange,
  listRooms,
  todayInRome,
} from "@musicpro/database";

import { mergeCalendarEvents } from "@/components/lezioni/calendar-bookings";
import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";
import {
  calendarBounds,
  calendarWeekShowsSunday,
  isIsoDate,
  parseCalendarView,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    sala?: string;
    hl?: string;
  }>;
}

export default async function AdminPrenotazioniCalendarioPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageBookings(member.roles)) {
    redirect("/admin/associati");
  }

  const params = await searchParams;
  const today = todayInRome();
  const view = parseCalendarView(params.view);
  const anchorDate = isIsoDate(params.date) ? params.date : today;
  const highlightDay = isIsoDate(params.hl) ? params.hl : null;

  const [settings, rooms] = await Promise.all([
    getLessonSchoolSettings(supabase),
    listRooms(supabase),
  ]);

  const roomOptions = rooms.map((room) => ({ id: room.id, name: room.name }));
  const roomId =
    params.sala && roomOptions.some((row) => row.id === params.sala)
      ? params.sala
      : null;

  const sundayVisible = calendarWeekShowsSunday({
    schoolSundayVisible: settings?.sundayVisible ?? false,
    includesNonSchool: true,
  });
  const bounds = calendarBounds(view, anchorDate, sundayVisible);

  const roomFilter = roomId ?? undefined;
  const [bookings, externals] = await Promise.all([
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
      <p className="text-xs text-neutral-500">
        Sale e occupazioni esterne — trascina su slot vuoto per creare, clic
        per modificare.
      </p>

      <LessonsCalendarPage
        initialLessons={mergeCalendarEvents([], bookings, externals)}
        settings={{
          sundayVisible,
          gridOpenMinute: settings?.gridOpenMinute ?? 600,
          gridCloseMinute: settings?.gridCloseMinute ?? 1380,
          slotGranularityMinutes: settings?.slotGranularityMinutes ?? 15,
        }}
        rooms={roomOptions}
        bookingRooms={rooms}
        initialRoomId={roomId}
        initialView={view}
        initialDate={anchorDate}
        initialMode="sala"
        isStaff
        canDrag={false}
        courseDetailBasePath="/admin/prenotazioni"
        today={today}
        highlightDay={highlightDay}
        memberId={member.id}
        bookingsOnly
      />
    </div>
  );
}
