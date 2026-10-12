import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getMemberCreditBalance,
  hasActiveCourseEnrollment,
  listLessonsInRange,
  listMyBookings,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { AssociatePageShell } from "@/components/associate/associate-page-shell";
import { MemberHome } from "@/components/associate/member-home";
import { LessonsUnavailableNotice } from "@/components/lezioni/lessons-unavailable-notice";
import {
  loadTeacherHomeData,
  TeacherHome,
} from "@/components/lezioni/teacher-home";
import { isLessonsModuleEnabled } from "@/lib/lessons-module";
import { StaffDashboardLoading } from "@/components/admin/admin-page-loading";
import { StaffDashboardLoader } from "@/components/dashboard/staff-dashboard-loader";
import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { BookingPaymentReturnNotice } from "@/components/prenotazioni/booking-payment-return";
import {
  canAccessAdmin,
  canManageBookings,
  canManageMembers,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";
import { formatBookingWhen } from "@/lib/ui/associate-theme";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    sala?: string;
    docente?: string;
    ambito?: string;
    hl?: string;
    dopoPagamento?: string;
    bookingId?: string;
    info?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const params = await searchParams;
  const today = todayInRome();
  const paymentComplete = params.dopoPagamento === "1";
  const paymentBookingId = params.bookingId?.trim() || null;
  const inAdminShell = canAccessAdmin(member.roles);

  const lessonsEnabled = isLessonsModuleEnabled();
  const isDocente = member.roles.includes(MemberRole.Docente);
  const showBookingsCalendar = canManageBookings(member.roles);
  const showStaffLessons = lessonsEnabled && canManageMembers(member.roles);
  const showTeacherLessons = lessonsEnabled && isDocente;
  const showLessonsOffNotice =
    !lessonsEnabled &&
    (canManageMembers(member.roles) || isDocente);
  const lessonsOffNotice =
    !lessonsEnabled &&
    (showLessonsOffNotice || params.info === "lessons_sandbox") ? (
      <LessonsUnavailableNotice />
    ) : null;
  const showOperational =
    showBookingsCalendar || showTeacherLessons || showStaffLessons;
  const showUnifiedCalendar =
    showBookingsCalendar || showStaffLessons || showTeacherLessons;

  const paymentNotice = paymentComplete ? (
    <BookingPaymentReturnNotice bookingId={paymentBookingId} />
  ) : null;

  if (
    lessonsEnabled &&
    showTeacherLessons &&
    !showStaffLessons &&
    !showBookingsCalendar
  ) {
    const teacherHome = (
      <>
        {paymentNotice}
        {lessonsOffNotice}
        <TeacherHome
          firstName={member.firstName}
          data={await loadTeacherHomeData(member.id)}
        />
      </>
    );
    if (inAdminShell) {
      return <div className="space-y-4">{teacherHome}</div>;
    }
    return (
      <AssociatePageShell actions={<HeaderSettingsActions />}>
        {teacherHome}
      </AssociatePageShell>
    );
  }

  if (!showOperational) {
    const isAllievo =
      lessonsEnabled &&
      (await hasActiveCourseEnrollment(supabase, member.id));
    const [associateLessons, upcomingBookings, creditBalance] = await Promise.all([
      isAllievo
        ? listLessonsInRange(supabase, {
            from: today,
            to: addDaysIso(today, 90),
            studentMemberId: member.id,
          })
        : Promise.resolve([]),
      listMyBookings(supabase, member.id, "upcoming"),
      getMemberCreditBalance(supabase, member.id).catch(() => null),
    ]);
    const nextAssociateLesson = associateLessons[0] ?? null;
    const nextAssociateBooking = upcomingBookings[0] ?? null;

    const home = (
      <>
        {paymentNotice}
        {lessonsOffNotice}
        <MemberHome
          firstName={member.firstName}
          showNextLesson={isAllievo}
          nextLesson={
            nextAssociateLesson?.startsAt
              ? {
                  subjectName: nextAssociateLesson.subjectName,
                  startsAt: nextAssociateLesson.startsAt,
                  teacherLabel: `${nextAssociateLesson.titularFirstName} ${nextAssociateLesson.titularLastName}`.trim(),
                }
              : null
          }
          nextBooking={
            nextAssociateBooking
              ? {
                  roomName: nextAssociateBooking.room?.name ?? "Sala",
                  whenLabel: formatBookingWhen(
                    nextAssociateBooking.start_at,
                    nextAssociateBooking.end_at,
                  ),
                }
              : null
          }
          creditAvailable={creditBalance?.available ?? 0}
        />
      </>
    );

    if (inAdminShell) {
      return <div className="space-y-4">{home}</div>;
    }

    return (
      <AssociatePageShell actions={<HeaderSettingsActions />}>{home}</AssociatePageShell>
    );
  }

  const calendarParams = {
    view: params.view,
    date: params.date,
    sala: params.sala,
    docente: params.docente,
    ambito: params.ambito,
    hl: params.hl,
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {paymentNotice}
      {lessonsOffNotice}
      <Suspense fallback={<StaffDashboardLoading />}>
        <StaffDashboardLoader
          memberId={member.id}
          roles={member.roles}
          searchParams={calendarParams}
          showBookingsCalendar={showBookingsCalendar}
          showStaffLessons={showStaffLessons}
          showTeacherLessons={showTeacherLessons}
          showUnifiedCalendar={showUnifiedCalendar}
        />
      </Suspense>
    </div>
  );
}

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
