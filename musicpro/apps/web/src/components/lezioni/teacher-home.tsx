import Link from "next/link";
import { Children, type ReactNode } from "react";

import {
  listCoordinatedCourses,
  listCourses,
  listLessonsInRange,
  todayInRome,
  type CalendarLesson,
  type Course,
} from "@musicpro/database";

import { courseSlotLabel } from "@/components/lezioni/course-labels";
import { formatLessonWhen } from "@/lib/ui/associate-theme";
import { createClient } from "@/lib/supabase/server";

const PREVIEW = 4;

export type TeacherHomeData = {
  attendance: CalendarLesson[];
  upcoming: CalendarLesson[];
  courses: Course[];
  coordinatedCount: number;
};

export async function loadTeacherHomeData(
  memberId: string,
): Promise<TeacherHomeData> {
  const supabase = await createClient();
  const today = todayInRome();
  const [past, upcoming, courses, coordinated] = await Promise.all([
    listLessonsInRange(supabase, {
      from: addRomeDays(today, -14),
      to: today,
      titularMemberId: memberId,
    }),
    listLessonsInRange(supabase, {
      from: today,
      to: addRomeDays(today, 14),
      titularMemberId: memberId,
    }),
    listCourses(supabase, { titularMemberId: memberId, status: "attivo" }),
    listCoordinatedCourses(supabase, memberId),
  ]);

  return {
    attendance: past.filter(
      (lesson) =>
        lesson.startsAt &&
        !lesson.hasAttendance &&
        !lesson.id.startsWith("hold:") &&
        lesson.courseStatus !== "in_attesa",
    ),
    upcoming: upcoming.filter(
      (lesson) => lesson.startsAt && !lesson.id.startsWith("hold:"),
    ),
    courses,
    coordinatedCount: coordinated.length,
  };
}

export function TeacherHome({
  firstName,
  data,
}: {
  firstName: string;
  data: TeacherHomeData;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--brand)] sm:text-4xl">
          Ciao, {firstName}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">La tua giornata in scuola</p>
      </div>

      <HomeSection
        title="Presenze da inserire"
        href="/lezioni/oggi"
        count={data.attendance.length}
        empty="Nessuna presenza in ritardo."
      >
        {data.attendance.slice(0, PREVIEW).map((lesson) => (
          <HomeRow
            key={lesson.id}
            href="/lezioni/oggi"
            title={lessonLabel(lesson)}
            meta={lessonMeta(lesson)}
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Prossime lezioni"
        href="/lezioni/calendario"
        count={data.upcoming.length}
        empty="Nessuna lezione nei prossimi 14 giorni."
      >
        {data.upcoming.slice(0, PREVIEW).map((lesson) => (
          <HomeRow
            key={lesson.id}
            href={`/lezioni/corsi/${lesson.courseId}`}
            title={lessonLabel(lesson)}
            meta={lessonMeta(lesson)}
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Corsi attivi"
        href="/lezioni/corsi"
        count={data.courses.length}
        empty="Nessun corso attivo."
      >
        {data.courses.slice(0, PREVIEW).map((course) => (
          <HomeRow
            key={course.id}
            href={`/lezioni/corsi/${course.id}`}
            title={course.name}
            meta={courseSlotLabel(course)}
          />
        ))}
        {data.coordinatedCount > 0 ? (
          <HomeRow
            href="/lezioni/corsi"
            title="Che coordino"
            meta={
              data.coordinatedCount === 1
                ? "1 corso"
                : `${data.coordinatedCount} corsi`
            }
          />
        ) : null}
      </HomeSection>

      <HomeSection
        title="Fatture e rimborsi"
        href="/lezioni/fatture"
        empty="Apri per notule e note spese."
      >
        <HomeRow
          href="/lezioni/notule"
          title="Notule didattiche"
          meta="Ore, compenso e firma"
        />
        <HomeRow
          href="/dashboard/impostazioni"
          title="Note spese"
          meta="Rimborsi già presenti in scheda"
        />
      </HomeSection>
    </div>
  );
}

function HomeSection({
  title,
  href,
  count,
  empty,
  children,
}: {
  title: string;
  href: string;
  count?: number;
  empty: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const hasRows = items.length > 0;
  return (
    <section className="glass-card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-white/60 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
          {title}
          {count != null && count > 0 ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
              {count}
            </span>
          ) : null}
        </h2>
        <Link href={href} className="text-sm font-medium text-[var(--brand)] hover:underline">
          Apri
        </Link>
      </div>
      {hasRows ? (
        <ul className="divide-y divide-neutral-100">{items}</ul>
      ) : (
        <p className="px-4 py-3 text-sm text-neutral-600">{empty}</p>
      )}
    </section>
  );
}

function HomeRow({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {title}
          </span>
          <span className="block truncate text-xs text-neutral-600">{meta}</span>
        </span>
      </Link>
    </li>
  );
}

function lessonLabel(lesson: CalendarLesson): string {
  return lesson.courseName.trim() || lesson.studentNames[0] || "Lezione";
}

function lessonMeta(lesson: CalendarLesson): string {
  const when = lesson.startsAt ? formatLessonWhen(lesson.startsAt) : "—";
  const who = lesson.studentNames.slice(0, 2).join(", ");
  const room = lesson.roomName?.trim();
  return [when, who, room].filter(Boolean).join(" · ");
}

function addRomeDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
