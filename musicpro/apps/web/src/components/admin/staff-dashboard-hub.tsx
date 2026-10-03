import Link from "next/link";
import type { ReactNode } from "react";

import {
  type AdminBookingListItem,
  bookingStatusLabel,
  formatBookingDateTime,
  getRomeMinutesFromMidnight,
  minutesToTimeLabel,
} from "@musicpro/database";

import {
  lessonCourseId,
  type OggiLesson,
} from "@/components/lezioni/lessons-oggi";
import { roomVisualFromName } from "@/lib/ui/associate-theme";

export interface StaffDashboardHubProps {
  firstName: string;
  showBookings: boolean;
  showStaffLessons: boolean;
  showTeacherLessons: boolean;
  pendingApprovalCount: number;
  unplacedCount: number;
  codaCount: number;
  arrearsCount: number;
  upcomingBookings: AdminBookingListItem[];
  todayLessons: OggiLesson[];
}

function bookingStatusTone(status: AdminBookingListItem["status"]): string {
  if (status === "pending_approval") return "bg-amber-100 text-amber-900";
  if (status === "confirmed") return "bg-green-100 text-green-800";
  return "bg-neutral-100 text-neutral-700";
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

function ActionCard({
  href,
  emoji,
  emojiBg,
  title,
  description,
  badge,
}: {
  href: string;
  emoji: string;
  emojiBg: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="glass-card group relative block p-4 transition hover:border-[var(--brand)]/20 sm:p-5"
    >
      {badge ? (
        <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          {badge}
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${emojiBg}`}
        >
          {emoji}
        </span>
        <div className="min-w-0 pr-6">
          <p className="font-medium text-[var(--brand)] group-hover:underline">
            {title}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function HeroShell({
  label,
  children,
  icon,
  iconBg,
}: {
  label: string;
  children: ReactNode;
  icon: string;
  iconBg: string;
}) {
  return (
    <section className="glass-card overflow-hidden p-0">
      <div className="border-b border-white/60 bg-gradient-to-br from-[var(--brand)]/[0.06] to-transparent px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
          {label}
        </p>
      </div>
      <div className="flex items-start justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
        <div className="min-w-0 flex-1">{children}</div>
        <div
          aria-hidden
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl sm:h-14 sm:w-14 sm:text-2xl ${iconBg}`}
        >
          {icon}
        </div>
      </div>
    </section>
  );
}

function lessonTimeLabel(lesson: OggiLesson): string {
  if (!lesson.startsAt) return "—";
  const start = minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.startsAt));
  const end = lesson.endsAt
    ? minutesToTimeLabel(getRomeMinutesFromMidnight(lesson.endsAt))
    : null;
  return end ? `${start}–${end}` : start;
}

function lessonTitle(lesson: OggiLesson): string {
  return lesson.courseName.trim() || lesson.studentNames[0] || "Lezione";
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
  firstName,
  showBookings,
  showStaffLessons,
  showTeacherLessons,
  pendingApprovalCount,
  unplacedCount,
  codaCount,
  arrearsCount,
  upcomingBookings,
  todayLessons,
}: StaffDashboardHubProps) {
  const showLessons = showStaffLessons || showTeacherLessons;
  const lessonsCalendarHref = showStaffLessons
    ? "/admin/lezioni/calendario"
    : "/lezioni/calendario";
  const lessonsTodayHref = showStaffLessons
    ? "/admin/lezioni/oggi"
    : "/lezioni/oggi";
  const courseDetailBasePath = showStaffLessons
    ? "/admin/lezioni/corsi"
    : "/lezioni/corsi";

  const nextBooking = upcomingBookings[0] ?? null;
  const moreBookings = upcomingBookings.slice(1, 4);
  const nextLesson = todayLessons[0] ?? null;
  const moreLessons = todayLessons.slice(1, 4);

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
  if (showStaffLessons && arrearsCount > 0) {
    todoItems.push({
      href: "/admin/lezioni/oggi",
      label: `${arrearsCount} presenze da segnare`,
    });
  }

  const heroIsBooking = Boolean(showBookings && nextBooking);
  const heroIsLesson = !heroIsBooking && Boolean(showLessons && nextLesson);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--brand)] sm:text-3xl">
          Ciao, {firstName}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Plancia operativa — accedi ai calendari e alle code dal menu o dalle
          scorciatoie sotto.
        </p>
      </div>

      {todoItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">{todoItems.map((item) => (
            <TodoPill key={item.href} href={item.href} label={item.label} />
          ))}</div>
      ) : null}

      {heroIsBooking && nextBooking ? (
        <Link href={`/admin/prenotazioni/${nextBooking.id}`} className="block">
          <HeroShell
            label="Prossima prenotazione"
            icon="📅"
            iconBg="bg-[#38764B]/15"
          >
            <p className="font-display text-lg font-semibold text-[var(--brand)] sm:text-xl">
              {nextBooking.room?.name ?? "Sala"}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {formatBookingDateTime(nextBooking.start_at, nextBooking.end_at)}
            </p>
            <p className="mt-0.5 truncate text-sm text-neutral-600">
              {nextBooking.member
                ? `${nextBooking.member.first_name} ${nextBooking.member.last_name}`.trim()
                : "Associato"}
            </p>
            <span
              className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${bookingStatusTone(nextBooking.status)}`}
            >
              {bookingStatusLabel(
                nextBooking.status,
                nextBooking.payment_status,
              )}
            </span>
          </HeroShell>
        </Link>
      ) : null}

      {heroIsLesson && nextLesson ? (
        <Link
          href={`${courseDetailBasePath}/${lessonCourseId(nextLesson)}`}
          className="block"
        >
          <HeroShell label="Prossima lezione oggi" icon="🎸" iconBg="bg-[var(--brand-accent)]/15">
            <p className="font-display text-lg font-semibold text-[var(--brand)] sm:text-xl">
              {lessonTitle(nextLesson)}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {lessonTimeLabel(nextLesson)}
              {nextLesson.roomName ? ` · ${nextLesson.roomName}` : ""}
            </p>
            {nextLesson.studentNames.length > 0 ? (
              <p className="mt-0.5 truncate text-sm text-neutral-600">
                {nextLesson.studentNames.join(", ")}
              </p>
            ) : null}
          </HeroShell>
        </Link>
      ) : null}

      {!heroIsBooking && !heroIsLesson ? (
        <HeroShell
          label="Oggi in scuola"
          icon="✨"
          iconBg="bg-[var(--brand)]/10"
        >
          <p className="font-display text-lg font-semibold text-[var(--brand)] sm:text-xl">
            Nessuna attività imminente
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Prenotazioni e lezioni compariranno qui appena programmate.
          </p>
        </HeroShell>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {showBookings ? (
          <ActionCard
            href="/admin/prenotazioni/calendario"
            emoji="📅"
            emojiBg="bg-[#38764B]/15"
            title="Calendario sale"
            description="Prenotazioni e occupazioni"
          />
        ) : null}
        {showBookings ? (
          <ActionCard
            href="/admin/prenotazioni/lista"
            emoji="📋"
            emojiBg="bg-[var(--brand-accent)]/15"
            title="Lista prenotazioni"
            description="Approva, modifica, cerca"
            badge={
              pendingApprovalCount > 0
                ? `${pendingApprovalCount} da approvare`
                : undefined
            }
          />
        ) : null}
        {showLessons ? (
          <ActionCard
            href={lessonsTodayHref}
            emoji="🎓"
            emojiBg="bg-sky-100"
            title="Lezioni oggi"
            description={
              todayLessons.length > 0
                ? `${todayLessons.length} in programma`
                : "Registro e presenze"
            }
            badge={arrearsCount > 0 ? `${arrearsCount} da segnare` : undefined}
          />
        ) : null}
        {showLessons ? (
          <ActionCard
            href={lessonsCalendarHref}
            emoji="🗓️"
            emojiBg="bg-violet-100"
            title="Calendario lezioni"
            description="Modifica e sposta al volo"
            badge={unplacedCount > 0 ? `${unplacedCount} da piazzare` : undefined}
          />
        ) : null}
        {showStaffLessons ? (
          <ActionCard
            href="/admin/associati"
            emoji="👥"
            emojiBg="bg-[var(--brand)]/10"
            title="Rubrica"
            description="Anagrafica associati"
          />
        ) : null}
        {showStaffLessons ? (
          <ActionCard
            href="/admin/lezioni/coda"
            emoji="⏳"
            emojiBg="bg-amber-100"
            title="Coda lezioni"
            description="Approvazioni e richieste"
            badge={codaCount > 0 ? `${codaCount} in coda` : undefined}
          />
        ) : null}
      </div>

      {moreBookings.length > 0 || moreLessons.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {moreBookings.length > 0 ? (
            <section className="glass-card p-3 sm:p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Altre prenotazioni
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
                  Altre lezioni oggi
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
                    title={lessonTitle(lesson)}
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
