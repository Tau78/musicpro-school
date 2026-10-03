import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  hasActiveCourseEnrollment,
  listLessonsInRange,
  listMyBookings,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { StaffDashboardHub } from "@/components/admin/staff-dashboard-hub";
import { AssociatePageShell } from "@/components/associate/associate-page-shell";
import { MemberHome } from "@/components/associate/member-home";
import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";
import { BookingPaymentReturnNotice } from "@/components/prenotazioni/booking-payment-return";
import {
  canAccessAdmin,
  canManageBookings,
  canManageMembers,
} from "@/lib/admin/roles";
import { loadStaffDashboardHub } from "@/lib/dashboard/load-staff-hub";
import { createClient } from "@/lib/supabase/server";
import { formatBookingWhen } from "@/lib/ui/associate-theme";

interface PageProps {
  searchParams: Promise<{
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

  const paymentNotice = paymentComplete ? (
    <BookingPaymentReturnNotice bookingId={paymentBookingId} />
  ) : null;

  if (!showOperational) {
    const isAllievo = await hasActiveCourseEnrollment(supabase, member.id);
    const [associateLessons, upcomingBookings] = await Promise.all([
      isAllievo
        ? listLessonsInRange(supabase, {
            from: today,
            to: addDaysIso(today, 90),
            studentMemberId: member.id,
          })
        : Promise.resolve([]),
      listMyBookings(supabase, member.id, "upcoming"),
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

  const hubProps = await loadStaffDashboardHub(supabase, member.id, today, {
    showBookingsCalendar,
    showStaffLessons,
    showTeacherLessons,
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {paymentNotice}
      <StaffDashboardHub {...hubProps} firstName={member.firstName} />
    </div>
  );
}

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
