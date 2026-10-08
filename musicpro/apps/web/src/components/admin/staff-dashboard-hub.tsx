import Link from "next/link";
import type { ReactNode } from "react";

import {
  type AdminBookingListItem,
  formatBookingDateTime,
  formatCreditsCount,
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
  canManageShop?: boolean;
  pendingApprovalCount: number;
  unplacedCount: number;
  codaCount: number;
  arrearsCount: number;
  upcomingBookings: AdminBookingListItem[];
  todayLessons: OggiLesson[];
  creditAvailable?: number;
  creditsInCirculation?: number | null;
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
      className="glass-card group relative flex min-h-[4.5rem] items-start gap-2.5 p-3 transition hover:border-[var(--brand)]/20"
    >
      {badge ? (
        <span className="absolute right-2 top-2 max-w-[46%] truncate rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
          {badge}
        </span>
      ) : null}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${emojiBg}`}
      >
        {emoji}
      </span>
      <div className={`min-w-0 ${badge ? "pr-14" : ""}`}>
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
  showBookings,
  showStaffLessons,
  showTeacherLessons,
  canManageShop = false,
  pendingApprovalCount,
  unplacedCount,
  codaCount,
  arrearsCount,
  upcomingBookings,
  todayLessons,
  creditAvailable = 0,
  creditsInCirculation = null,
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
      ? "/admin/lezioni/coda"
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

  const lessonsBadgeParts: string[] = [];
  if (showStaffLessons && codaCount > 0) {
    lessonsBadgeParts.push(`${codaCount} coda`);
  }
  if (arrearsCount > 0) {
    lessonsBadgeParts.push(`${arrearsCount} da segnare`);
  }
  if (todayLessons.length > 0 && lessonsBadgeParts.length === 0) {
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
          <ActionChip
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
            badge={
              lessonsBadgeParts.length > 0
                ? lessonsBadgeParts.join(" · ")
                : undefined
            }
          />
        ) : null}
      </div>

      {todoItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {todoItems.map((item) => (
            <TodoPill key={item.href} href={item.href} label={item.label} />
          ))}
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
