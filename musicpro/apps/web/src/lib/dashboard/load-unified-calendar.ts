import {
  listBookingsInRange,
  listExternalCalendarEventsInRange,
  listLessonsInRange,
} from "@musicpro/database";

import { mergeCalendarEvents } from "@/components/lezioni/calendar-bookings";
import type { CalendarScope } from "@/components/lezioni/lessons-calendar-page";
import { calendarBounds } from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

export async function loadUnifiedCalendarEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: {
    view: "day" | "3day" | "week" | "month";
    anchorDate: string;
    sundayVisible: boolean;
    scope: CalendarScope;
    roomId: string | null;
    teacherId: string | null;
    includeLessons: boolean;
    includeBookings: boolean;
    teacherMemberId?: string;
  },
) {
  const bounds = calendarBounds(
    options.view,
    options.anchorDate,
    options.sundayVisible,
  );
  const roomFilter = options.roomId ?? undefined;
  const teacherFilter = options.teacherId ?? options.teacherMemberId;

  const effectiveScope = options.scope;
  const loadLessons =
    options.includeLessons &&
    (effectiveScope === "tutto" || effectiveScope === "lezioni");
  const loadBookings =
    options.includeBookings &&
    (effectiveScope === "tutto" || effectiveScope === "prenotazioni");

  const [lessons, bookings, externals] = await Promise.all([
    loadLessons
      ? listLessonsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
          includePendingHold: true,
          titularMemberId: teacherFilter ?? undefined,
          teacherMemberId: options.teacherMemberId,
          roomId: roomFilter,
        })
      : Promise.resolve([]),
    loadBookings
      ? listBookingsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
          roomId: roomFilter,
        })
      : Promise.resolve([]),
    loadBookings
      ? listExternalCalendarEventsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
          roomId: roomFilter,
        })
      : Promise.resolve([]),
  ]);

  return mergeCalendarEvents(lessons, bookings, externals);
}
