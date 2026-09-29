import Link from "next/link";
import type { ReactNode } from "react";

import {
  type AdminBookingListItem,
  bookingStatusLabel,
  formatBookingDateTime,
} from "@musicpro/database";

import {
  LessonsOggi,
  type OggiLesson,
} from "@/components/lezioni/lessons-oggi";

export interface StaffDashboardHubProps {
  showBookings: boolean;
  showStaffLessons: boolean;
  showTeacherLessons: boolean;
  actorMemberId: string;
  pendingApprovalCount: number;
  unplacedCount: number;
  codaCount: number;
  upcomingBookings: AdminBookingListItem[];
  todayLessons: OggiLesson[];
  todayArrears?: OggiLesson[];
  teacherCanReschedule?: boolean;
}

function bookingStatusTone(status: AdminBookingListItem["status"]): string {
  if (status === "pending_approval") return "bg-amber-100 text-amber-900";
  if (status === "confirmed") return "bg-green-100 text-green-800";
  return "bg-neutral-100 text-neutral-700";
}

function TodoPill({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
    >
      {label}
    </Link>
  );
}

function SectionCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 sm:px-4">
        <h2 className="text-sm font-semibold text-[var(--brand)]">{title}</h2>
        {actions ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="px-3 py-3 sm:px-4">{children}</div>
    </section>
  );
}

function HeaderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--brand)] hover:underline"
    >
      {label}
    </Link>
  );
}

export function StaffDashboardHub({
  showBookings,
  showStaffLessons,
  showTeacherLessons,
  actorMemberId,
  pendingApprovalCount,
  unplacedCount,
  codaCount,
  upcomingBookings,
  todayLessons,
  todayArrears,
}: StaffDashboardHubProps) {
  const showLessons = showStaffLessons || showTeacherLessons;
  const lessonsCalendarHref = showStaffLessons
    ? "/admin/lezioni/calendario"
    : "/lezioni/calendario";
  const courseDetailBasePath = showStaffLessons
    ? "/admin/lezioni/corsi"
    : "/lezioni/corsi";

  const todoItems: { href: string; label: string }[] = [];
  if (showBookings && pendingApprovalCount > 0) {
    todoItems.push({
      href: "/admin/prenotazioni/lista",
      label: `${pendingApprovalCount} da approvare`,
    });
  }
  if (showStaffLessons && unplacedCount > 0) {
    todoItems.push({
      href: "/admin/lezioni/calendario",
      label: `${unplacedCount} da piazzare`,
    });
  }
  if (showStaffLessons && codaCount > 0) {
    todoItems.push({
      href: "/admin/lezioni/coda",
      label: `${codaCount} in coda`,
    });
  }

  const quickLinks: { href: string; label: string }[] = [];
  if (showBookings) {
    quickLinks.push({
      href: "/admin/prenotazioni/calendario",
      label: "Calendario sale",
    });
  }
  if (showLessons) {
    quickLinks.push({
      href: lessonsCalendarHref,
      label: "Calendario lezioni",
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {todoItems.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Da fare
          </h2>
          <div className="flex flex-wrap gap-2">
            {todoItems.map((item) => (
              <TodoPill key={item.href} href={item.href} label={item.label} />
            ))}
          </div>
        </section>
      ) : null}

      <div
        className={`grid gap-4 ${showBookings && showLessons ? "lg:grid-cols-2 lg:gap-5" : ""}`}
      >
        {showBookings ? (
          <SectionCard
            title="Prossime prenotazioni"
            actions={
              <>
                <HeaderLink
                  href="/admin/prenotazioni/calendario"
                  label="Apri calendario"
                />
                <HeaderLink href="/admin/prenotazioni/lista" label="Lista" />
              </>
            }
          >
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nessuna prenotazione in arrivo.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200">
                {upcomingBookings.map((booking) => {
                  const memberName = booking.member
                    ? `${booking.member.first_name} ${booking.member.last_name}`.trim()
                    : "Associato";

                  return (
                    <li key={booking.id}>
                      <Link
                        href={`/admin/prenotazioni/${booking.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">
                            {booking.room?.name ?? "Sala"}
                          </p>
                          <p className="truncate text-xs text-neutral-600">
                            {formatBookingDateTime(
                              booking.start_at,
                              booking.end_at,
                            )}
                            <span className="text-neutral-300"> · </span>
                            {memberName}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${bookingStatusTone(booking.status)}`}
                        >
                          {bookingStatusLabel(
                            booking.status,
                            booking.payment_status,
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        ) : null}

        {showLessons ? (
          <SectionCard
            title="Lezioni oggi"
            actions={
              <HeaderLink href={lessonsCalendarHref} label="Apri calendario" />
            }
          >
            <LessonsOggi
              lessons={todayLessons}
              arrears={todayArrears}
              actorMemberId={actorMemberId}
              isStaff={showStaffLessons}
              courseDetailBasePath={courseDetailBasePath}
            />
          </SectionCard>
        ) : null}
      </div>

      {quickLinks.length > 0 ? (
        <nav
          aria-label="Collegamenti rapidi"
          className="flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-200 pt-3 text-xs"
        >
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium text-[var(--brand)] hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
