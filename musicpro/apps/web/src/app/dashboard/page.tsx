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

import { StaffDashboardHub } from "@/components/admin/staff-dashboard-hub";
import { AssociatePageShell } from "@/components/associate/associate-page-shell";
import { MemberHome } from "@/components/associate/member-home";
import {
  loadTeacherHomeData,
  TeacherHome,
} from "@/components/lezioni/teacher-home";
import { StaffUnifiedCalendar } from "@/components/dashboard/staff-unified-calendar";
import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";
import { BookingPaymentReturnNotice } from "@/components/prenotazioni/booking-payment-return";
import {
  canAccessAdmin,
  canManageBookings,
  canManageMembers,
  canManageShop,
} from "@/lib/admin/roles";
import { loadStaffDashboardHub } from "@/lib/dashboard/load-staff-hub";
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

  const isDocente = member.roles.includes(MemberRole.Docente);
  const showBookingsCalendar = canManageBookings(member.roles);
  const showStaffLessons = canManageMembers(member.roles);
  const showTeacherLessons = isDocente;
  const showOperational =
    showBookingsCalendar || showTeacherLessons || showStaffLessons;
  const showUnifiedCalendar =
    showBookingsCalendar || showStaffLessons || showTeacherLessons;

  const paymentNotice = paymentComplete ? (
    <BookingPaymentReturnNotice bookingId={paymentBookingId} />
  ) : null;

  if (showTeacherLessons && !showStaffLessons && !showBookingsCalendar) {
    const teacherHome = (
      <>
        {paymentNotice}
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
      <AssociatePageShell actions={<SettingsGearLink />}>
        {teacherHome}
      </AssociatePageShell>
    );
  }

  if (!showOperational) {
    const isAllievo = await hasActiveCourseEnrollment(supabase, member.id);
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
      <AssociatePageShell actions={<SettingsGearLink />}>{home}</AssociatePageShell>
    );
  }

  const manageShop = canManageShop(member.roles);
  const hubProps = await loadStaffDashboardHub(supabase, member.id, today, {
    showBookingsCalendar,
    showStaffLessons,
    showTeacherLessons,
    loadCreditsInCirculation: manageShop,
  });

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
      <StaffDashboardHub
        {...hubProps}
        firstName={member.firstName}
        canManageShop={manageShop}
        embeddedCalendar={
          showUnifiedCalendar ? (
            <StaffUnifiedCalendar
              memberId={member.id}
              searchParams={calendarParams}
              showStaffLessons={showStaffLessons}
              showBookingsCalendar={showBookingsCalendar}
              showTeacherLessons={showTeacherLessons}
              lockTeacherId={
                showTeacherLessons && !showStaffLessons ? member.id : null
              }
            />
          ) : null
        }
      />
    </div>
  );
}

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
