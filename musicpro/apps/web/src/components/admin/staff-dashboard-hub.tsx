import Link from "next/link";
import type { ReactNode } from "react";

import {
  type AdminBookingListItem,
  type CalendarLesson,
  formatBookingDateTime,
  formatCreditsCount,
  getRomeMinutesFromMidnight,
  minutesToTimeLabel,
  type Room,
} from "@musicpro/database";

import { StaffQuickBookingAction } from "@/components/admin/staff-quick-booking-action";
import { TeacherAbsenceOpenButton } from "@/components/lezioni/teacher-absent-actions";
import {
  lessonCourseId,
  oggiLessonTitle,
} from "@/lib/lezioni/oggi-lesson";
import { roomVisualFromName } from "@/lib/ui/associate-theme";

export interface StaffDashboardHubProps {
  showBookings: boolean;
  showStaffLessons: boolean;
  showTeacherLessons: boolean;
  canManageShop?: boolean;
  pendingApprovalCount: number;
  codaCount: number;
  /** Dove porta il numerino Lezioni: coda operativa o richieste corso. */
  lessonsAlertHref?: string;
  arrearsCount: number;
  upcomingBookings: AdminBookingListItem[];
  bookingRooms?: Room[];
  todayLessons: CalendarLesson[];
  creditAvailable?: number;
  creditsInCirculation?: number | null;
  today?: string;
  actorMemberId?: string;
}

function TodoPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50/90 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
    >
      {label}
    </Link>
  );
}

function ActionChip({
  href,
  emoji,
  emojiBg,
  title,
  description,
  badge,
  countBadge,
  countAria = "da approvare",
}: {
  href: string;
  emoji: string;
  emojiBg: string;
  title: string;
  description: string;
  badge?: string;
  /** Numerino bianco su fondo rosso. */
  countBadge?: number;
  countAria?: string;
}) {
  const countLabel =
    countBadge != null && countBadge > 0
      ? countBadge > 99
        ? "99+"
        : String(countBadge)
      : null;

  return (
    <Link
      href={href}
      className="glass-card group relative flex min-h-[4.5rem] items-start gap-2.5 p-3 transition hover:border-[var(--brand)]/20"
    >
      {countLabel ? (
        <span
          className="absolute right-2 top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white"
          aria-label={`${countLabel} ${countAria}`}
        >
          {countLabel}
        </span>
      ) : null}
      {badge ? (
        <span
          className={`absolute top-2 max-w-[46%] truncate rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 ${
            countLabel ? "right-9" : "right-2"
          }`}
        >
          {badge}
        </span>
      ) : null}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${emojiBg}`}
      >
        {emoji}
      </span>
      <div
        className={`min-w-0 ${
          countLabel && badge ? "pr-20" : countLabel ? "pr-8" : badge ? "pr-14" : ""
        }`}
      >
        <p className="text-sm font-semibold text-[var(--brand)] group-hover:underline">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-neutral-600">
          {description}
        </p>
      </div>
    </Link>
  );
}

function lessonTimeLabel(lesson: CalendarLesson): string {
  if (!lesson.startsAt) return "—";
  const start = minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.startsAt));
  const end = lesson.endsAt
    ? minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.endsAt))
    : null;
  return end ? `${start}–${end}` : start;
}

function CompactRow({
  href,
  title,
  meta,
  trailing,
}: {
  href: string;
  title: string;
  meta: string;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/60"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">{title}</p>
        <p className="truncate text-xs text-neutral-600">{meta}</p>
      </div>
      {trailing}
    </Link>
  );
}

export function StaffDashboardHub({
  showBookings,
  showStaffLessons,
  showTeacherLessons,
  canManageShop = false,
  pendingApprovalCount,
  codaCount,
  lessonsAlertHref = "/admin/lezioni/coda",
  arrearsCount,
  upcomingBookings,
  bookingRooms = [],
  todayLessons,
  creditAvailable = 0,
  creditsInCirculation = null,
  today = "",
  actorMemberId,
  embeddedCalendar = null,
}: StaffDashboardHubProps & {
  embeddedCalendar?: ReactNode;
}) {
  const showLessons = showStaffLessons || showTeacherLessons;
  const lessonsTodayHref = showStaffLessons
    ? "/admin/lezioni/oggi"
    : "/lezioni/oggi";
  const lessonsHubHref = showStaffLessons
    ? codaCount > 0
      ? lessonsAlertHref
      : "/admin/lezioni/oggi"
    : "/lezioni/oggi";
  const courseDetailBasePath = showStaffLessons
    ? "/admin/lezioni/corsi"
    : "/lezioni/corsi";

  const moreBookings = upcomingBookings.slice(0, 4);
  const moreLessons = todayLessons.slice(0, 4);

  const todoItems: { href: string; label: string }[] = [];
  if (showBookings && pendingApprovalCount > 0) {
    todoItems.push({
      href: "/admin/prenotazioni/lista",
      label: `${pendingApprovalCount} da approvare`,
    });
  }
  if (showStaffLessons && codaCount > 0) {
    todoItems.push({
      href: lessonsAlertHref,
      label: `${codaCount} da fare`,
    });
  }
  if (showStaffLessons && arrearsCount > 0) {
    todoItems.push({
      href: "/admin/lezioni/oggi",
      label: `${arrearsCount} presenze da segnare`,
    });
  }

  const lessonsBadgeParts: string[] = [];
  if (arrearsCount > 0) {
    lessonsBadgeParts.push(`${arrearsCount} da segnare`);
  }
  if (todayLessons.length > 0 && lessonsBadgeParts.length === 0 && codaCount === 0) {
    lessonsBadgeParts.push(`${todayLessons.length} oggi`);
  }

  const creditsHref = canManageShop ? "/admin/shop" : "/dashboard/shop";
  const creditsDescription = canManageShop
    ? creditsInCirculation != null && creditsInCirculation > 0
      ? `${formatCreditsCount(creditsInCirculation)} in circolazione · shop e storico`
      : "Totale, shop, promozioni e storico"
    : creditAvailable > 0
      ? `${formatCreditsCount(creditAvailable)} · vai allo shop`
      : "Saldo e acquisto crediti sala";

  const bookingListChip = showBookings ? (
    <ActionChip
      href="/admin/prenotazioni/lista"
      emoji="📋"
      emojiBg="bg-[var(--brand-accent)]/15"
      title="Lista prenotazioni"
      description="Approva, modifica, cerca"
      countBadge={pendingApprovalCount}
    />
  ) : null;

  const lessonsChip = showLessons ? (
    <ActionChip
      href={lessonsHubHref}
      emoji="🎓"
      emojiBg="bg-sky-100"
      title={showStaffLessons ? "Lezioni" : "Lezioni oggi"}
      description={
        showStaffLessons
          ? "Oggi, registro, coda e richieste"
          : todayLessons.length > 0
            ? `${todayLessons.length} in programma`
            : "Registro e presenze"
      }
      countBadge={showStaffLessons ? codaCount : 0}
      countAria="in attesa"
      badge={
        lessonsBadgeParts.length > 0
          ? lessonsBadgeParts.join(" · ")
          : undefined
      }
    />
  ) : null;

  /** Griglia 2×2: evita colonna prenotazioni doppia che spinge Lezioni fuori riquadro. */
  const actionGridFlat = showBookings && showLessons;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <ActionChip
          href={creditsHref}
          emoji="🎟️"
          emojiBg="bg-amber-100"
          title="Crediti"
          description={creditsDescription}
        />
        {showBookings ? (
          actionGridFlat ? (
            bookingListChip
          ) : (
            <div className="flex flex-col gap-2.5">
              {bookingListChip}
              {today ? (
                <StaffQuickBookingAction rooms={bookingRooms} today={today} />
              ) : null}
            </div>
          )
        ) : (
          lessonsChip
        )}
        {actionGridFlat ? lessonsChip : null}
        {actionGridFlat && today ? (
          <StaffQuickBookingAction rooms={bookingRooms} today={today} />
        ) : null}
      </div>

      {todoItems.length > 0 || (showTeacherLessons && actorMemberId) ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {todoItems.map((item) => (
            <TodoPill key={item.href} href={item.href} label={item.label} />
          ))}
          {showTeacherLessons && actorMemberId ? (
            <TeacherAbsenceOpenButton
              actorMemberId={actorMemberId}
              isStaff={showStaffLessons}
            />
          ) : null}
        </div>
      ) : null}

      {embeddedCalendar ? (
        <div className="min-w-0">{embeddedCalendar}</div>
      ) : null}

      {moreBookings.length > 0 || moreLessons.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {moreBookings.length > 0 ? (
            <section className="glass-card p-3 sm:p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Prenotazioni
                </h2>
                <Link
                  href="/admin/prenotazioni/lista"
                  className="text-xs font-medium text-[var(--brand)] hover:underline"
                >
                  Tutte
                </Link>
              </div>
              <div className="divide-y divide-neutral-200/80">
                {moreBookings.map((booking) => {
                  const memberName = booking.member
                    ? `${booking.member.first_name} ${booking.member.last_name}`.trim()
                    : "Associato";
                  const roomVisual = roomVisualFromName(
                    booking.room?.name ?? "",
                  );
                  return (
                    <CompactRow
                      key={booking.id}
                      href={`/admin/prenotazioni/${booking.id}`}
                      title={booking.room?.name ?? "Sala"}
                      meta={`${formatBookingDateTime(booking.start_at, booking.end_at)} · ${memberName}`}
                      trailing={
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: roomVisual.color }}
                        />
                      }
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {moreLessons.length > 0 ? (
            <section className="glass-card p-3 sm:p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Lezioni oggi
                </h2>
                <Link
                  href={lessonsTodayHref}
                  className="text-xs font-medium text-[var(--brand)] hover:underline"
                >
                  Registro
                </Link>
              </div>
              <div className="divide-y divide-neutral-200/80">
                {moreLessons.map((lesson) => (
                  <CompactRow
                    key={lesson.id}
                    href={`${courseDetailBasePath}/${lessonCourseId(lesson)}`}
                    title={oggiLessonTitle(lesson)}
                    meta={`${lessonTimeLabel(lesson)}${lesson.roomName ? ` · ${lesson.roomName}` : ""}`}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
