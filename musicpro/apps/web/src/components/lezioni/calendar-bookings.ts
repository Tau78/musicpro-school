import type {
  AdminBookingListItem,
  ExternalCalendarEvent,
} from "@musicpro/database";

import type { CalendarLesson } from "@/components/lezioni/lessons-calendar";

export function bookingEventId(id: string): string {
  return `booking:${id}`;
}

export function parseBookingId(id: string): string | null {
  return id.startsWith("booking:") ? id.slice("booking:".length) : null;
}

export function resolveBookingIdFromCalendarEvent(
  lessonId: string,
  lesson?: Pick<CalendarLesson, "id" | "source" | "bookingId"> | null,
): string | null {
  const fromId = parseBookingId(lessonId);
  if (fromId) return fromId;
  if (lesson?.source === "booking") {
    return parseBookingId(lesson.id);
  }
  return null;
}

export function toBookingLesson(booking: AdminBookingListItem): CalendarLesson {
  const memberName = booking.member
    ? `${booking.member.last_name} ${booking.member.first_name}`.trim()
    : "";
  const snapshot = booking.member_snapshot?.[0];
  const snapshotName = snapshot
    ? `${snapshot.last_name} ${snapshot.first_name}`.trim()
    : "";
  return {
    id: bookingEventId(booking.id),
    courseId: "",
    sequenceNumber: 0,
    startsAt: booking.start_at,
    endsAt: booking.end_at,
    roomId: booking.room_id,
    courseName:
      booking.band?.name ||
      memberName ||
      snapshotName ||
      booking.title ||
      "Prenotazione",
    courseKind: "gruppo",
    courseStatus: "attivo",
    studentNames: memberName ? [memberName] : [],
    titularFirstName: null,
    titularLastName: null,
    roomName: booking.room?.name ?? null,
    source: "booking",
    bookingStatus: booking.status,
    proviDaSolo: booking.provi_da_solo,
  };
}

export function externalEventId(id: string): string {
  return `external:${id}`;
}

export function parseExternalEventId(id: string): string | null {
  return id.startsWith("external:") ? id.slice("external:".length) : null;
}

export function toExternalLesson(event: ExternalCalendarEvent): CalendarLesson {
  return {
    id: externalEventId(event.id),
    courseId: "",
    sequenceNumber: 0,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    roomId: event.roomId,
    courseName: event.summary?.trim() || event.calendarName || "Calendario",
    courseKind: "gruppo",
    courseStatus: "attivo",
    studentNames: [],
    titularFirstName: null,
    titularLastName: null,
    roomName: event.roomName,
    source: "external",
    calendarColorId: event.calendarColorId,
  };
}

export function mergeCalendarEvents(
  lessons: Array<CalendarLesson & { bookingId?: string | null }>,
  bookings: AdminBookingListItem[],
  externals: ExternalCalendarEvent[] = [],
): CalendarLesson[] {
  const used = new Set(
    lessons
      .map((lesson) => lesson.bookingId)
      .filter((id): id is string => Boolean(id)),
  );
  return [
    ...lessons,
    ...bookings.filter((row) => !used.has(row.id)).map(toBookingLesson),
    ...externals.map(toExternalLesson),
  ];
}
