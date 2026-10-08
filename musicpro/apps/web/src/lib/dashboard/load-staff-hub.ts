import {
  countPendingApprovalBookings,
  getCreditsCirculationSummary,
  getMemberCreditBalance,
  listAdminBookings,
  listLessonsInRange,
  listLessonsOnDate,
  listPendingCourses,
  listPendingLessonChangeRequests,
  listUnplacedLessons,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/server";

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export async function loadStaffDashboardHub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  today: string,
  flags: {
    showBookingsCalendar: boolean;
    showStaffLessons: boolean;
    showTeacherLessons: boolean;
    loadCreditsInCirculation?: boolean;
  },
) {
  const {
    showBookingsCalendar,
    showStaffLessons,
    showTeacherLessons,
    loadCreditsInCirculation = false,
  } = flags;
  const showLessons = showStaffLessons || showTeacherLessons;

  const [
    pendingApprovalCount,
    upcomingBookingsRaw,
    unplacedLessons,
    pendingCourses,
    changeRequests,
    todayLessons,
    arrearsRange,
    creditBalance,
    circulation,
  ] = await Promise.all([
    showBookingsCalendar
      ? countPendingApprovalBookings(supabase)
      : Promise.resolve(0),
    showBookingsCalendar
      ? listAdminBookings(supabase, "upcoming")
      : Promise.resolve([]),
    showStaffLessons
      ? listUnplacedLessons(supabase)
      : Promise.resolve([]),
    showStaffLessons
      ? listPendingCourses(supabase)
      : Promise.resolve([]),
    showStaffLessons
      ? listPendingLessonChangeRequests(supabase)
      : Promise.resolve([]),
    showLessons
      ? listLessonsOnDate(supabase, today, {
          includePendingHold: true,
          ...(showStaffLessons ? {} : { teacherMemberId: memberId }),
        })
      : Promise.resolve([]),
    showStaffLessons
      ? listLessonsInRange(supabase, {
          from: addDaysIso(today, -14),
          to: today,
        })
      : Promise.resolve([]),
    getMemberCreditBalance(supabase, memberId).catch(() => null),
    loadCreditsInCirculation
      ? getCreditsCirculationSummary(supabase).catch(() => null)
      : Promise.resolve(null),
  ]);

  const arrearsCount = showStaffLessons
    ? arrearsRange.filter(
        (lesson) =>
          !lesson.hasAttendance &&
          !lesson.id.startsWith("hold:") &&
          lesson.courseStatus !== "in_attesa",
      ).length
    : 0;

  const creditsInCirculation =
    circulation == null ? null : circulation.totalAvailable;

  return {
    showBookings: showBookingsCalendar,
    showStaffLessons,
    showTeacherLessons,
    pendingApprovalCount,
    unplacedCount: unplacedLessons.length,
    codaCount: pendingCourses.length + changeRequests.length,
    arrearsCount,
    upcomingBookings: upcomingBookingsRaw.slice(0, 4),
    todayLessons,
    creditAvailable: creditBalance?.available ?? 0,
    creditsInCirculation,
  };
}
