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

  const sundayVisible = settings?.sundayVisible ?? false;
  const bounds =
    view === "month"
      ? monthBounds(anchorDate)
      : weekBounds(anchorDate, sundayVisible);

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
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Prenotazioni sale
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Calendario prenotazioni e occupazioni esterne. Trascina su uno slot
          vuoto per creare, clicca un evento per modificarlo.
        </p>
      </div>

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
