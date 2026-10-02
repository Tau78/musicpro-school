import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getLessonSchoolSettings,
  getTeacherProfile,
  hasActiveCourseEnrollment,
  listBookingsInRange,
  listExternalCalendarEventsInRange,
  listLessonsInRange,
  listMemberLabelsWithRole,
  listMyBookings,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { APP_NAME, MemberRole } from "@musicpro/shared";

import { AssociatePageShell } from "@/components/associate/associate-page-shell";
import { MemberHome } from "@/components/associate/member-home";
import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";
import { mergeCalendarEvents } from "@/components/lezioni/calendar-bookings";
import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { UnplacedLessonsBlock } from "@/components/lezioni/unplaced-lessons-block";
import { BookingPaymentReturnNotice } from "@/components/prenotazioni/booking-payment-return";
import {
  canAccessAdmin,
  canManageBookings,
  canManageMembers,
} from "@/lib/admin/roles";
import {
  calendarBounds,
  isIsoDate,
  parseCalendarView,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";
import { formatBookingWhen } from "@/lib/ui/associate-theme";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    sala?: string;
    docente?: string;
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
  const view = parseCalendarView(params.view);
  const anchorDate = isIsoDate(params.date) ? params.date : today;
  const highlightDay = isIsoDate(params.hl) ? params.hl : null;
  const paymentComplete = params.dopoPagamento === "1";
  const paymentBookingId = params.bookingId?.trim() || null;

  const isDocente = member.roles.includes(MemberRole.Docente);
  const showBookingsCalendar = canManageBookings(member.roles);
  const showStaffLessons = canManageMembers(member.roles);
  const showTeacherLessons = isDocente;
  const showOperational =
    showBookingsCalendar || showTeacherLessons || showStaffLessons;
  const showAdminLink = canAccessAdmin(member.roles);

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
  const bounds = calendarBounds(view, anchorDate, sundayVisible);

  const calendarSettings = {
    sundayVisible,
    gridOpenMinute: settings?.gridOpenMinute ?? 600,
    gridCloseMinute: settings?.gridCloseMinute ?? 1380,
    slotGranularityMinutes: settings?.slotGranularityMinutes ?? 15,
  };

  const [
    salaBookings,
    salaExternals,
    lessonBookings,
    lessonExternals,
    teachers,
    teacherProfile,
  ] = await Promise.all([
    showBookingsCalendar
      ? listBookingsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
          roomId: roomId ?? undefined,
        })
      : Promise.resolve([]),
    showBookingsCalendar
      ? listExternalCalendarEventsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
          roomId: roomId ?? undefined,
        })
      : Promise.resolve([]),
    showStaffLessons
      ? listBookingsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
        })
      : Promise.resolve([]),
    showStaffLessons
      ? listExternalCalendarEventsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
        })
      : Promise.resolve([]),
    showStaffLessons
      ? listMemberLabelsWithRole(supabase, MemberRole.Docente)
      : Promise.resolve([]),
    showTeacherLessons && !showStaffLessons
      ? getTeacherProfile(supabase, member.id)
      : Promise.resolve(null),
  ]);

  const teacherId =
    showStaffLessons &&
    params.docente &&
    teachers.some((row) => row.id === params.docente)
      ? params.docente
      : null;

  const lessonEvents =
    showStaffLessons || showTeacherLessons
      ? await listLessonsInRange(supabase, {
          from: bounds.from,
          to: bounds.to,
          includePendingHold: true,
          ...(showStaffLessons
            ? { titularMemberId: teacherId ?? undefined }
            : { teacherMemberId: member.id }),
        })
      : [];

  const bookingOnlyEvents = showBookingsCalendar
    ? mergeCalendarEvents([], salaBookings, salaExternals)
    : [];

  const staffLessonEvents = showStaffLessons
    ? mergeCalendarEvents(lessonEvents, lessonBookings, lessonExternals)
    : lessonEvents;

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

    return (
      <AssociatePageShell actions={<SettingsGearLink />}>
        {paymentComplete ? (
          <div className="mb-6">
            <BookingPaymentReturnNotice bookingId={paymentBookingId} />
          </div>
        ) : null}
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
      </AssociatePageShell>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isDocente ? (
              <Link
                href="/lezioni"
                className="hidden text-sm text-neutral-600 hover:text-[var(--brand)] sm:inline"
              >
                Area lezioni
              </Link>
            ) : null}
            {showAdminLink ? (
              <Link
                href="/admin"
                className="hidden text-sm text-neutral-600 hover:text-[var(--brand)] sm:inline"
              >
                Admin
              </Link>
            ) : null}
            <SettingsGearLink />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        {paymentComplete ? (
          <BookingPaymentReturnNotice bookingId={paymentBookingId} />
        ) : null}

        {
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-[var(--brand)]">
                    Sala prove
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    {showBookingsCalendar
                      ? "Calendario cliccabile: trascina su uno slot vuoto per creare, clicca un evento per modificare o cancellare."
                      : "Prenota una sala o gestisci le tue prove dall’area riservata."}
                  </p>
                </div>
                {showBookingsCalendar ? (
                  <Link
                    href="/admin/prenotazioni/calendario"
                    className="text-sm font-medium text-[var(--brand)] hover:underline"
                  >
                    Apri in Admin
                  </Link>
                ) : null}
              </div>

              {showBookingsCalendar ? (
                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
                  <LessonsCalendarPage
                    initialLessons={bookingOnlyEvents}
                    settings={calendarSettings}
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
              ) : (
                <MemberSalaLinks />
              )}
            </section>

            {showTeacherLessons || showStaffLessons ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-[var(--brand)]">
                      Lezioni
                    </h2>
                    <p className="mt-1 text-sm text-neutral-600">
                      Calendario cliccabile con modifiche e cancellazioni.
                      Aggiungi o riposiziona lezioni al volo dagli slot e dalle
                      lezioni da piazzare.
                    </p>
                  </div>
                  <Link
                    href={
                      showStaffLessons
                        ? "/admin/lezioni/calendario"
                        : "/lezioni/calendario"
                    }
                    className="text-sm font-medium text-[var(--brand)] hover:underline"
                  >
                    Apri calendario completo
                  </Link>
                </div>

                {showStaffLessons ? (
                  <Suspense fallback={null}>
                    <UnplacedLessonsBlock
                      actor={{
                        memberId: member.id,
                        isStaff: true,
                        canReschedule: true,
                      }}
                      rooms={roomOptions}
                      courseDetailBaseHref="/admin/lezioni/corsi"
                    />
                  </Suspense>
                ) : null}

                {showTeacherLessons &&
                !showStaffLessons &&
                teacherProfile?.canReschedule ? (
                  <Suspense fallback={null}>
                    <UnplacedLessonsBlock
                      actor={{
                        memberId: member.id,
                        isStaff: false,
                        canReschedule: true,
                      }}
                      rooms={roomOptions}
                      courseDetailBaseHref="/lezioni/corsi"
                      titularMemberId={member.id}
                    />
                  </Suspense>
                ) : null}

                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
                  <LessonsCalendarPage
                    initialLessons={
                      showStaffLessons ? staffLessonEvents : lessonEvents
                    }
                    settings={calendarSettings}
                    rooms={roomOptions}
                    teachers={showStaffLessons ? teachers : []}
                    initialTeacherId={teacherId}
                    initialView={view}
                    initialDate={anchorDate}
                    initialMode="docente"
                    isStaff={showStaffLessons}
                    canDrag={
                      showStaffLessons ||
                      (teacherProfile?.canReschedule ?? false)
                    }
                    courseDetailBasePath={
                      showStaffLessons
                        ? "/admin/lezioni/corsi"
                        : "/lezioni/corsi"
                    }
                    today={today}
                    highlightDay={highlightDay}
                    memberId={member.id}
                    bookingRooms={rooms}
                  />
                </div>
              </section>
            ) : null}
          </>
        }
      </div>
    </main>
  );
}

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function MemberSalaLinks() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/prenotazioni"
          className="inline-flex rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
        >
          Prenota una sala
        </Link>
        <Link
          href="/prenotazioni/mie"
          className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Le mie prenotazioni
        </Link>
      </div>
    </div>
  );
}

